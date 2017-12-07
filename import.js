#!/usr/local/bin/node

"use strict";

let unixio = require("unixio");

async function read_active() {
	let ret = {};
	let fp = await unixio.fopen("../tweets/.active", "r");

	let s;
	while ((s = await fp.gets()) != null) {
		let fields = s.split(" ");
		ret[fields[0]] = parseInt(fields[1]);
	}

	fp.close();
	return ret;
}

let quotetext = {};

function quotename(s) {
	let out = '"';

	let i;
	for (i = 0; i < s.length; i++) {
		if (s.charAt(i) == '"') {
			out += '\\"';
		} else if (s.charAt(i) <= "~") {
			out += s.charAt(i);
		} else {
			out += "?"; // XXX charset
		}
	}

	out += '"';

	return out;
}

// XXX this is a mess
function trimtext(s) {
	let out = "";

	let word = "";
	let i;
	for (i = 0; i < s.length; i++) {
		if (s.charAt(i) > " ") {
			word += s.charAt(i);
		} else {
			if (out.length + word.length < 50) {
				out += word + " ";
				word = "";
			} else {
				break;
			}
		}
	}

	if (out.length + word.length < 50) {
		out += word + " ";
	}

	return out;
}

// XXX this is a mess
function wrap(s) {
	let out = "";
	let line = "";
	let word = "";

	let i;
	for (i = 0; i < s.length; i++) {
		if (s.charAt(i) > " ") {
			word += s.charAt(i);
		} else if (s.charAt(i) == "\n") {
			if (line.length + word.length < 72) {
				out += line + word + "\n";
				line = "";
				word = "";
			} else {
				out += line + "\n" + word + "\n";
				line = "";
				word = "";
			}
		} else {
			if (line.length + word.length < 72) {
				line += word + " ";
				word = "";
			} else {
				out += line + "\n";
				line = word + " ";
				word = "";
			}
		}
	}

	if (line.length + word.length < 72) {
		out += line + word + "\n";
	} else {
		out += line + "\n" + word + "\n";
	}

	return out;
}

async function convert(text, active) {
	if ("timestamp_ms" in text) {
		if ("extended_tweet" in text) {
			text.text = text.extended_tweet.full_text;
		}

		quotetext[text.id_str] = text.text;

		let out = "From: " + quotename(text.user.name) + " <" + text.user.screen_name + "@twitter.com>\n";
		out += "Subject: " + trimtext(text.text) + "\n";
		out += "Message-ID: <" + text.id_str + "@twitter.com>\n";

		if (text.in_reply_to_status_id_str != null) {
			out += "References: <" + text.in_reply_to_status_id_str + "@twitter.com>\n";
		}
		out += "Newsgroups: misc\n";
		out += "\n";

		if (text.in_reply_to_screen_name != null) {
			if (text.in_reply_to_status_id_str in quotetext) {
				out +=
					"In article <" +
					text.in_reply_to_status_id_str +
					"@twitter.com>, " +
					text.in_reply_to_screen_name +
					" wrote:\n";
				let quoted = wrap(quotetext[text.in_reply_to_status_id_str]);

				let i;
				for (i = 0; i < quoted.length; i++) {
					if (i == 0 || quoted.charAt(i - 1) == "\n") {
						out += "> ";
					}

					out += quoted.charAt(i);
				}

				out += "\n";
			}
		}

		out += wrap(text.text);
		out += "\n\n";

		await unixio.stdout.puts(out);
	}
}

function nextjson(s, i) {
	let depth = 0;

	for (; i < s.length; i++) {
		let c = s.charAt(i);

		if (c == " " || c == "\r" || c == "\n" || c == "\t") {
			continue;
		} else if (c == "[" || c == "{") {
			depth++;
		} else if (c == "]" || c == "}") {
			depth--;
		} else if (c == "-" || c == "+" || c == "." || (c >= "0" && c <= "9")) {
			for (; i < s.length; i++) {
				c = s.charAt(i);

				if (c == "-" || c == "+" || c == "." || c == "e" || c == "E" || (c >= "0" && c <= "9")) {
					continue;
				} else {
					i--;
					break;
				}
			}
		} else if (c == '"') {
			i++; // consume quotation mark

			for (; i < s.length; i++) {
				c = s.charAt(i);

				if (c == '"') {
					break;
				} else if (c == "\\") {
					if (s.charAt(i + 1) == "u") {
						i += 5;
					} else {
						i++;
					}
				} else {
					continue;
				}
			}
		} else if (c == ":" || c == ",") {
		} else if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z")) {
			for (; i < s.length; i++) {
				c = s.charAt(i);
				if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z")) {
					continue;
				} else {
					i--;
					break;
				}
			}
		} else {
			throw new Error("Unexpected " + c);
		}

		if (depth == 0) {
			return i + 1;
		}
	}

	return i;
}

async function process(s, active) {
	let i = 0;
	let here = 0;

	while (i < s.length) {
		i = nextjson(s, i);

		while (here < i && (s.charAt(here) == " " || s.charAt(here) == "\t" || s.charAt(here) == "\r" || s.charAt(here) == "\n")) {
			here++;
		}

		if (s.charAt(here) == "[") {
			await process(s.substring(here + 1, i - 1), active);
		} else {
			if (here != i && s.substring(here, i) != "," && s.substring(here, i) != "\n" && s.substring(here, i) != " ") {
				let j;
				let fail = false;

				try {
					j = JSON.parse(s.substring(here, i));
				} catch (e) {
					await unixio.stderr.puts(s.substring(here, i) + ": ");
					await unixio.stderr.puts(e.toString() + "\n");
					fail = true;
				}

				if (!fail) {
					await convert(j, active);
				}
			}
		}

		here = i;
	}
}

async function main() {
	let active = await read_active();

	let s;
	while ((s = await unixio.stdin.gets()) != null) {
		await process(s, active);
	}
}

unixio.call(main);

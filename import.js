#!/usr/local/bin/node

"use strict";

let unixio = require("unixio");
let fsextra = require("fs-extra");

let home = process.env.HOME;
let tweets = home + "/tweets";

async function read_active() {
	let ret = {};
	let fp = await unixio.fopen(tweets + "/.active", "r");

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

function pad(t) {
	if (t < 10) {
		return "0" + t;
	} else {
		return t;
	}
}

function todate(milli) {
	let d = new Date(milli);
	let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	let days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

	let out =
		days[d.getDay()] +
		", " +
		d.getDate() +
		" " +
		months[d.getMonth()] +
		" " +
		(d.getYear() + 1900) +
		" " +
		pad(d.getHours()) +
		":" +
		pad(d.getMinutes()) +
		":" +
		pad(d.getSeconds()) +
		" +0000";

	return out;
}

async function convert(text, active) {
	if ("timestamp_ms" in text) {
		if ("retweeted_status" in text) {
			return await convert(text.retweeted_status, active);
		}

		if ("extended_tweet" in text) {
			text.text = text.extended_tweet.full_text;
		}

		if (text.id_str in quotetext) {
			return;
		}

		quotetext[text.id_str] = text.text;

		let user = quotename(text.user.name) + " <" + text.user.screen_name + "@twitter.com>";
		let subject = trimtext(text.text);
		let date = todate(Number(text.timestamp_ms));
		let msgid = "<" + text.id_str + "@twitter.com>";
		let refs = "<" + text.in_reply_to_status_id_str + "@twitter.com>";
		let newsgroup = "misc";

		if (text.in_reply_to_status_id_str == null) {
			refs = "";
		}

		let id;
		if (newsgroup in active) {
			id = ++active[newsgroup];
		} else {
			active[newsgroup] = 1;
			id = 1;
		}

		let out = "";
		out += "From: " + user + "\n";
		out += "Subject: " + subject + "\n";
		out += "Date: " + date + "\n";
		out += "Message-ID: " + msgid + "\n";

		if (refs != "") {
			out += "References: " + refs + "\n";
		}

		out += "Newsgroups: " + newsgroup + "\n";
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

		out += wrap(text.text) + "\n";

		try {
			await fsextra.mkdir(tweets + "/" + newsgroup);
		} catch (e) {
			// should fail if it already exists
		}

		let fp = await unixio.fopen(tweets + "/" + newsgroup + "/" + id, "w");
		await fp.puts(out);
		await fp.close();

		let bytes = Buffer.from(out).length;
		let lines = 0;

		let i;
		for (i = 0; i < out.length; i++) {
			if (out.charAt(i) == "\n") {
				lines++;
			}
		}

		fp = await unixio.fopen(tweets + "/" + newsgroup + "/.overview", "a");
		fp.puts(id + "\t" + subject + "\t" + user + "\t" + date + "\t" + msgid + "\t" + refs + "\t" + bytes + "\t" + lines + "\n");
		await fp.close();
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

async function handle(s, active) {
	let i = 0;
	let here = 0;

	while (i < s.length) {
		i = nextjson(s, i);

		while (here < i && (s.charAt(here) == " " || s.charAt(here) == "\t" || s.charAt(here) == "\r" || s.charAt(here) == "\n")) {
			here++;
		}

		if (s.charAt(here) == "[") {
			await handle(s.substring(here + 1, i - 1), active);
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
		await handle(s, active);
	}

	let fp = await unixio.fopen(tweets + "/.active", "w");
	let keys = Object.keys(active);
	let i;
	for (i = 0; i < keys.length; i++) {
		await fp.puts(keys[i] + " " + active[keys[i]] + " 1 n\n");
	}
	await fp.close();
}

unixio.call(main);

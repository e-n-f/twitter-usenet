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

async function convert(text, active) {
	if ("timestamp_ms" in text) {
		if ("extended_tweet" in text) {
			text.text = text.extended_tweet.full_text;
		}

		quotetext[text.id_str] = text.text;

		let out = "From: " + text.user.name + " <" + text.user.screen_name + "@twitter.com>\n";

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

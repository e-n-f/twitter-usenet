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

async function convert(text, active) {
	if ("timestamp_ms" in text) {
		if ("extended_tweet" in text) {
			text.text = text.extended_tweet.full_text;
		}
		await unixio.stdout.puts(JSON.stringify(text) + "\n");
	}
}

async function main() {
	let active = await read_active();

	let s;
	while ((s = await unixio.stdin.gets()) != null) {
		if (s.startsWith("[")) {
			let j;

			try {
				j = JSON.parse(s);
			} catch (e) {
				await unixio.stderr.puts(s.substring(0, 200) + ": ");
				await unixio.stderr.puts(e.toString());
				continue;
			}

			let i;
			for (i = 0; i < j.length; j++) {
				await convert(j[i], active);
			}
		} else if (s !== "\n" && s != "\r\n") {
			let j;

			try {
				j = JSON.parse(s);
			} catch (e) {
				await unixio.stderr.puts(s.substring(0, 200) + ": ");
				await unixio.stderr.puts(e.toString());
				continue;
			}

			await convert(j, active);
		}
	}
}

unixio.call(main);

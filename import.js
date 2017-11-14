#!/usr/local/bin/node

'use strict';

let unixio = require('unixio');

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

async function main() {
	let active = await read_active();
	unixio.stdout.puts(JSON.stringify(active));
}

unixio.call(main);

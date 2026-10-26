#!/usr/bin/env node
/* build-demo.js — the real page + the in-browser mock server, as one file: dist/triply-demo.html */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..');
let page = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock-api.js'), 'utf8');
const boot = '<script>window.TRIPLY={base:"",publicUrl:location.href.split("#")[0].replace(/\\/$/,"")};</script>\n<script>\n' + mock + '\n</script>';
page = page.replace('<!--TRIPLY_CONFIG-->', () => boot)
  .replace(/<!doctype html>\s*|<html[^>]*>\s*|<meta charset[^>]*>\s*|<meta name="viewport"[^>]*>\s*|<meta name="theme-color"[^>]*>\s*|<meta name="referrer"[^>]*>\s*|<link rel="icon"[^>]*>\s*/gi, '');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'triply-demo.html');
fs.writeFileSync(out, page);
console.log(out, fs.statSync(out).size, 'bytes');

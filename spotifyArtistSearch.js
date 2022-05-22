#!/usr/bin/env node

"use strict";
//adapted from https://github.com/JasonPuglisi/descent/blob/8a0d993a2fb5a449ce8c0271375bb2908c57d132/server.js

import http from "http";
import querystring from "querystring";

const PORT = 7769;

let spotifyKey;
authenticateSpotify(process.env.SPOTIFY_CLIENT, process.env.SPOTIFY_SECRET);

async function authenticateSpotify(client, secret) {
  if (!client || !secret) {
    console.warn("Error getting Spotify authorization: No API credentials");
    return;
  }

  const authorization = Buffer.from(`${client}:${secret}`).toString("base64");
  const rawResp = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${authorization}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (rawResp.status != 200) {
    console.warn(`Error getting Spotify authorization: ${rawResp.status}`);
    spotifyKey = null;
    setTimeout(() => {
      authenticateSpotify(client, secret);
    }, 100000);
    return;
  }

  const data = await rawResp.json();
  spotifyKey = data.access_token;
  setTimeout(() => {
    authenticateSpotify(client, secret);
  }, data.expires_in * 1000);
}

async function spotifyArtistSearch(artist) {
  let xml = '<?xml version="1.0" encoding="UTF-8" ?>\n';
  let statusCode = 200;

  if (!spotifyKey) {
    console.warn("Error getting Spotify track: No API key");
    xml += `<lfm status="failed">
<error code="6">No API key</error>
</lfm>`;
    statusCode = 500;
    return { xml, statusCode };
  }

  const rawResp = await fetch(
    "https://api.spotify.com/v1/search?q=" +
    encodeURIComponent(artist) +
    "&type=artist&limit=1",
    {
      headers: {
        Authorization: `Bearer ${spotifyKey}`,
      },
    }
  );

  if (rawResp.status != 200) {
    xml += `<lfm status="failed">
<error code="6">Invalid response code</error>
</lfm>`;
    console.warn(`Error getting Spotify artist: Invalid response: ${rawResp.status}`);
    statusCode = 500;
    return { xml, statusCode };
  }

  const data = await rawResp.json();

  if (data.artists.total < 1) {
    xml += '<lfm status="ok"></lfm>';
    console.warn(`No results for ${artist}`);
    return { xml, statusCode };
  }
  const artistItem = data.artists.items[0];
  if (artistItem.name.toLowerCase() != artist.toLowerCase())
    console.log(`Got ${artistItem.name} instead of ${artist}`);
  xml += `<lfm status="ok">
<artist>
<name>${xmlEscapeMap(artistItem.name)}</name>
`;
  if (artistItem.images && artistItem.images.length > 0) {
    let idx = 0;
    if (artistItem.images.length > 1) idx = artistItem.images.length - 2;
    xml +=
      '<image size="extralarge">' + artistItem.images[idx].url + "</image>\n";
  }

  xml += `</artist>
</lfm>`;

  return { xml, statusCode };
}

function collectRequestData(request) {
  return new Promise((resolve, reject) => {
    const FORM_URLENCODED = "application/x-www-form-urlencoded";
    if (request.headers["content-type"] === FORM_URLENCODED) {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk.toString();
      });
      request.on("end", () => {
        resolve(querystring.parse(body));
      });
    } else {
      resolve(null);
    }
  });
}

function xmlEscapeMap(string) {
  const xmlEscapeMap = {
    ">": "&gt;",
    "<": "&lt;",
    "'": "&apos;",
    '"': "&quot;",
    "&": "&amp;",
  };

  if (string === null || string === undefined) return;

  return string.replace(
    new RegExp("([&\"<>'])", "g"),
    (str, item) => xmlEscapeMap[item]
  );
}

const server = http.createServer(async (req, res) => {

  let form = null;
  if (req.url === "/" && req.method === "POST") {
    form = await collectRequestData(req);
  } else if (req.url.includes("?") && req.method === "GET") {
    const query = req.url.split("?")[1];
    form = querystring.parse(query);
  }

  if (
    form &&
    form.method &&
    form.method.toLowerCase() === "artist.getinfo.spotify" &&
    form.artist &&
    form.api_key === process.env.API_KEY
  ) {
    const { xml, statusCode } = await spotifyArtistSearch(form.artist);
    res.statusCode = statusCode;
    res.end(xml);
    return;
  }
  res.end();

});

server.listen(PORT, "127.0.0.1");
console.log("spotifyArtistSearch listening on " + PORT);

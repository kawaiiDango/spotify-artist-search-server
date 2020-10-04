'use strict'
//adapted from https://github.com/JasonPuglisi/descent/blob/8a0d993a2fb5a449ce8c0271375bb2908c57d132/server.js

import http from 'http';
import https from 'https';
import url from 'url';
import querystring from 'querystring';

const PORT = 7769;

let spotifyKey;
authenticateSpotify(process.env.SPOTIFY_CLIENT, process.env.SPOTIFY_SECRET);

function authenticateSpotify(client, secret) {
  if (!client || !secret) {
    console.warn('Error getting Spotify authorization: No API credentials');
    return;
  }

  let authorization = Buffer.from(`${client}:${secret}`).toString('base64');
  httpRequest('https://accounts.spotify.com/api/token',
    {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${authorization}`
    },
    'grant_type=client_credentials',
    (res, body) => {
      if (res.statusCode != 200) {
        console.warn(`Error getting Spotify authorization: ${err}`);
        spotifyKey = null;
        setTimeout(() => { authenticateSpotify(client, secret); }, 1800000);
        return;
      }
  
      let data = JSON.parse(body);
      spotifyKey = data.access_token;
      setTimeout(() => { authenticateSpotify(client, secret); }, data.expires_in * 1000);
    }
  )
}

function spotifyArtistSearch(artist, rescb) {
  if (!spotifyKey) {
    console.warn('Error getting Spotify track: No API key');
    xml += `<lfm status="failed">
<error code="6">No API key</error>
</lfm>`;
    rescb(xml);
  }

  httpRequest('https://api.spotify.com/v1/search?q=' + encodeURIComponent(artist) + '&type=artist&limit=1',
    {
      'Authorization': `Bearer ${spotifyKey}`
    },
    null,
    (res, body) => {
      let xml = '<?xml version="1.0" encoding="UTF-8" ?>\n';
      if (res.statusCode != 200) {
        xml += `<lfm status="failed">
<error code="6">Invalid response code</error>
</lfm>`;
        console.warn(`Error getting Spotify artist: Invalid response: ${err}`);
        rescb(xml);
        return;
      }

      let data = JSON.parse(body);
      if (data.artists.total < 1) {
        xml += '<lfm status="ok"></lfm>';
        console.warn(`No results for ${artist}`);
        rescb(xml);
        return;
      }
      let artistItem = data.artists.items[0];
      if (artistItem.name.toLowerCase() != artist.toLowerCase())
        console.log(`Got ${artistItem.name} instead of ${artist}`);
      xml += `<lfm status="ok">
<artist>
<name>${xmlEscapeMap(artistItem.name)}</name>
`;
      if (artistItem.images && artistItem.images.length > 0) {
        let idx = 0;
        if (artistItem.images.length > 1)
          idx = artistItem.images.length - 2
        xml += '<image size="extralarge">' + artistItem.images[idx].url +'</image>\n';
      }
        
      xml += `</artist>
</lfm>`;

      rescb(xml);
  });
}



function httpRequest(urlp, headers, postData, respcb) {
  let parsedUrl = url.parse(urlp, true);
  let options = {
    host: parsedUrl.host,
    path: parsedUrl.path
  };
  if (headers)
    options.headers = headers;
  if (postData)
    options.method = 'POST';
  let callback = response => {
    let str = '';
  
    response.on('data', chunk => {
      str += chunk;
    });
  
    response.on('end', () => {
      respcb(response, str);
    });
  }
  
  let req = https.request(options, callback);
  if (postData)
    req.write(postData);
  req.end();
}

function collectRequestData(request, callback) {
  const FORM_URLENCODED = 'application/x-www-form-urlencoded';
  if(request.headers['content-type'] === FORM_URLENCODED) {
      let body = '';
      request.on('data', chunk => {
          body += chunk.toString();
      });
      request.on('end', () => {
          callback(querystring.parse(body));
      });
  }
  else {
      callback(null);
  }
}


function xmlEscapeMap(string) {
  let xmlEscapeMap = {
        '>': '&gt;'
      , '<': '&lt;'
      , "'": '&apos;'
      , '"': '&quot;'
      , '&': '&amp;'
    };
  let pattern;

  if (string === null || string === undefined) return;

  pattern = '([&"<>\'])';

  return string.replace(new RegExp(pattern, 'g'), function(str, item) {
            return xmlEscapeMap[item];
          })
}

const server = http.createServer((req, res) => {
  if (req.url == '/' && req.method === 'POST') {
      collectRequestData(req, form => {
          if (form.method && form.method.toLowerCase() == 'artist.getinfo.spotify' && form.artist && form.api_key  == process.env.API_KEY)
            spotifyArtistSearch(form.artist, xml => {
              res.end(xml);
            })
          else
            res.end();
      });
  } 
  else
    res.end();
});
server.listen(PORT, '127.0.0.1');
console.log('spotifyArtistSearch listening on ' + PORT);
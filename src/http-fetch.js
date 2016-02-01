export default function http(method, uri, headers, body) {
  return fetch(uri, {
    method: method,
    headers: new Headers(headers),
    body: body
  });
}

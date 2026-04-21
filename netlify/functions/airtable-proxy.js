const BASE_ID = "appNML7rJEKiWkuVg";
const TABLE = "Prospects%20Master";
const API = "https://api.airtable.com/v0";

exports.handler = async (event) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors, body: '{"error":"POST only"}' };

  const token = process.env.AIRTABLE_PAT;
  if (!token) return { statusCode: 500, headers: cors, body: '{"error":"AIRTABLE_PAT missing"}' };

  let req;
  try { req = JSON.parse(event.body); } catch(e) { return { statusCode: 400, headers: cors, body: '{"error":"Bad JSON"}' }; }

  const auth = { Authorization: "Bearer " + token };

  try {
    if (req.action === "list") {
      var url = API + "/" + BASE_ID + "/" + TABLE + "?pageSize=100";
      if (req.offset) url += "&offset=" + encodeURIComponent(req.offset);
      var r = await fetch(url, { headers: auth });
      var t = await r.text();
      return { statusCode: r.status, headers: cors, body: t };
    }

    if (req.action === "update") {
      var url = API + "/" + BASE_ID + "/" + TABLE + "/" + req.recordId;
      var r = await fetch(url, {
        method: "PATCH",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: req.fields, typecast: true }),
      });
      var t = await r.text();
      return { statusCode: r.status, headers: cors, body: t };
    }

    if (req.action === "create") {
      var url = API + "/" + BASE_ID + "/" + TABLE;
      var r = await fetch(url, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: req.fields, typecast: true }),
      });
      var t = await r.text();
      return { statusCode: r.status, headers: cors, body: t };
    }

    return { statusCode: 400, headers: cors, body: '{"error":"Unknown action"}' };
  } catch(e) {
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};

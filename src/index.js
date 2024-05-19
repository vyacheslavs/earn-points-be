const express = require('express');
var fs = require("fs");
var points = require("./points.json")
const { createHash } = require('crypto');
const cors = require('cors');
const { request } = require('http');

const app = express ();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3001;
const X_FORWARD_EMAIL = process.env.X_FORWARD_EMAIL || "sample@domain.com";

const userId = (req) => {
    if (!(X_FORWARD_EMAIL in req))
        return "sample@domain.com";

    let userid = req[X_FORWARD_EMAIL];

    if (userid == null || userId.length === 0)
        userid = "sample@domain.com";

    if (!(userid in points)) {
        points[userid] = {
            "total_points":0,
            "limit_hits": {},
            "history":[]
        };    
    }
    
    return userid;
};

app.listen(PORT, () => {
  console.log("Server Listening on PORT:", PORT);
});

app.get("/status", (request, response) => {
  const status = {
     "status": "running"
  };

  response.send(status);
});

app.get('/history', (request, response) => {
    var status = {"success": true};

    status = { ... status, ... {"history": points[userId(request)].history, "total_points": points[userId(request)].total_points}};
    response.send(status);
});

app.get('/limithits/:limit_hash', (request, response) => {

    const limit_hash = request.params.limit_hash;

    var status = {"success": true};

    if (limit_hash in points[userId(request)].limit_hits) {
        status = { ... status, ...{"hits": points[userId(request)].limit_hits[limit_hash]}};
    } else {
        status = { ... status, ...{"hits": 0}};
    }

    response.send(status);
});

app.post('/spend', function(request, response) {
    let status_fail = {
        "success": false
    };

    if (!request.body.amount) {
        status_fail = {... status_fail, ... {"error": "API error: no amount field", "code": 4}}
        response.send(status_fail);
        return;
    }

    if (!request.body.name) {
        status_fail = {... status_fail, ... {"error": "API error: no name field", "code": 5}}
        response.send(status_fail);
        return;
    }

    if ( points[userId(request)].total_points < request.body.amount ) {
        status_fail = {... status_fail, ... {"error": "Not enough points to spend", "code": 6}}
        response.send(status_fail);
        return;
    }
    // register spend
    points[userId(request)].total_points -= request.body.amount;
    // register history
    let his = {"name": request.body.name, "amount": -request.body.amount, "date": (new Date()).toJSON(), "total": points[userId(request)].total_points};
    points[userId(request)].history.unshift(his);
    fs.writeFileSync('./points.json', JSON.stringify(points));

    let resp = {"total_points": points[userId(request)].total_points, "history": points[userId(request)].history, "success": true};
    response.send(resp);

});

app.post('/addpoints', function(request, response) {
    // request.body format
    // { "amount": N, "name": "Activity Name", "limits": {}}
    // 
    let status_fail = {
        "success": false
    };

    /*
    response.header("Access-Control-Allow-Origin", "*");
    response.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");*/

    if (!request.body.amount) {
        status_fail = {... status_fail, ... {"error": "no amount field", "code": 1}}
        response.send(status_fail);
        return;
    }

    if (!request.body.name) {
        status_fail = {... status_fail, ... {"error": "no name field", "code": 2}}
        response.send(status_fail);
        return;
    }

    let limit_hash = "";
    if (request.body.limits) {
        const limit_val = {"limits": request.body.limits,  "day": new Date().toISOString().slice(0, 10), "name": request.body.name};
        limit_hash = createHash('sha256').update(JSON.stringify(limit_val)).digest('hex');
    }

    if (limit_hash && (limit_hash in points[userId(request)].limit_hits) && request.body.limits.limit && points[userId(request)].limit_hits[limit_hash] >= request.body.limits.limit) {
        status_fail = {... status_fail, ... {"error": "limit exceeded", "code":3}}
        response.send(status_fail);
        return;
    }

    points[userId(request)].total_points += request.body.amount;
    let his = {"name": request.body.name, "amount": request.body.amount, "date": (new Date()).toJSON(), "total": points[userId(request)].total_points};
    if (limit_hash) {
        his = {... his, ...{"limit_hash":limit_hash}};
    }

    if (limit_hash) {
        if (!(limit_hash in points[userId(request)].limit_hits)) {
            points[userId(request)].limit_hits[limit_hash] = 1;
        } else {
            points[userId(request)].limit_hits[limit_hash] += 1;
        }
    }

    points[userId(request)].history.unshift(his);
    fs.writeFileSync('./points.json', JSON.stringify(points));

    let resp = {"total_points": points[userId(request)].total_points, "history": points[userId(request)].history, "success": true};
    if (limit_hash) {
        resp = {... resp, ...{"limit_hit": points[userId(request)].limit_hits[limit_hash], "limit_hash": limit_hash}};
    }

    response.send(resp);
});


/*
=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
NYTimes Bestseller - eBay Tool
=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
Description: The user fills out a form specifying book genre & date. This is passed
	to a first API that gets the most popular book from the NY Times Best Sellers List 
	[via API Key] for that genre and date. It gets the ISBN number for that book, which is
	then passed as a parameter to the eBay API [via OAuth 2.0 Client Credential], to gather
	all the listings for that book.
=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
*/

const http = require("http");
const https = require("https");
const fs = require("fs");
const url = require("url");
const querystring = require("querystring");

const port = 3000;
const server = http.createServer();

const NYT_credentials = require("./auth/nyt_credentials.json");
const Ebay_credentials = require("./auth/ebay_credentials.json");
const authentication_cache = "./auth/authentication-res.json";
const bestseller_cache = "./cache/bestseller_cache.json";

const get_authorization = function (client_id, client_secret) {
  let base64data = Buffer.from(`${client_id}:${client_secret}`).toString(
    "base64"
  );
  return base64data;
};

/*
	Iterate through all of the eBay listings.
	If no image is provided for a listing, utilize the placeholder image.
	Display as a table.
*/
function serve_results(resultset, res) {
  page = `<!DOCTYPE html><html><head><meta charset=utf-8><style>body{font-family: 'Lucida Sans','Lucida Sans Regular', 'Lucida Grande', 'Lucida Sans Unicode', Geneva, Verdana,sans-serif;padding: 30px;text-align: center;}table { width:100%; text-align: center;}table tr:nth-child(even){ background-color: #e6f7ff;}table tr:nth-child(odd) { background-color: #fff;}table th { background-color: #18558a; color: white; font-size: X-large;}</style><title>Results</title></head><body><table><tr><th>Image</th> <th>Item</th> <th>Seller</th> <th>Seller Score</th> <th>Condition</th> <th>Price</th> <th>Link<th></tr>`;
  for (let i = 0; i < resultset.itemSummaries.length; i++) {
    image = resultset.itemSummaries[i].image;
    if (image === undefined) image = "./images/placeholder.jpg";
    else image = image.imageUrl;
    page += `<tr>
		<td><img src="${image}" height="100"></td>
		<td>${resultset.itemSummaries[i].title}</td>
		<td>${resultset.itemSummaries[i].seller.username}</td>
		<td>${resultset.itemSummaries[i].seller.feedbackPercentage}%</td>
		<td>${resultset.itemSummaries[i].condition}</td>
		<td>$${resultset.itemSummaries[i].price.value}</td>
		<td><a href="${resultset.itemSummaries[i].itemWebUrl}">See Listing</a></td>
	  </tr>
	`;
  }
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(`<h1>Results</h1><br>${page}`);
}

/*
	Make a GET request to eBay to get all listings for that ISBN.
	Process the response data.
	Then call another function to serve the results.
*/
function request_ebay_listings(cached_auth, isbn, res) {
  headers = {
    "Content-Type": "application/json",
    "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    Authorization: `Bearer ${cached_auth.access_token}`,
    scope: "https://api.ebay.com/oauth/api_scope",
  };
  endpoint = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${isbn}`;
  let listings_req = https.get(
    endpoint,
    { headers: headers },
    function (listings_res) {
      let body = "";
      listings_res.on("data", function (chunk) {
        body += chunk;
      });
      listings_res.on("end", function () {
        let resultset = JSON.parse(body);
        serve_results(resultset, res);
      });
    }
  );
  listings_req.on("error", function (e) {
    console.log(e);
  });
}

/*	
	When you request a new eBay access token:
	- process the response
	- calculate an expiration time (1 hr)
	- write the token to a cache
	- call another function to get all eBay listings for that ISBN
*/
const recieved_authentication = function (
  authentication_res,
  isbn,
  auth_sent_time,
  res
) {
  authentication_res.setEncoding("utf8");
  let body = "";
  authentication_res.on("data", function (chunk) {
    body += chunk;
  });
  authentication_res.on("end", function () {
    let ebay_auth = JSON.parse(body);
    ebay_auth.expiration = auth_sent_time.getTime() + 3600000;
    create_access_token_cache(ebay_auth);
    request_ebay_listings(ebay_auth, isbn, res);
  });
};

/*
	Write eBay access token to a json cache.
*/
const create_access_token_cache = function (ebay_auth) {
  let content = JSON.stringify(ebay_auth);
  let output_path = "./auth/authentication-res.json";
  fs.writeFile(output_path, content, function (err) {
    if (err) {
      console.log(err);
    } else {
      console.log(`New Token Written To Cache.`);
    }
  });
};

/*
	Check to see if eBay access token is not expired.
	If it's expired, request a new one.
	Otherwise, call another function to get all eBay listings for that ISBN. 
*/
function request_ebay_information(isbn, res) {
  let post_data = querystring.stringify({ grant_type: "client_credentials" });
  var options = {
    method: "POST",
    hostname: "api.ebay.com",
    path: "/identity/v1/oauth2/token?grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${get_authorization(
        Ebay_credentials.client_id,
        Ebay_credentials.client_secret
      )}`,
    },
  };
  let cache_valid = false;
  if (fs.existsSync(authentication_cache)) {
    cached_auth = require(authentication_cache);
    if (new Date(cached_auth.expiration) > Date.now()) {
      cache_valid = true;
    } else {
      console.log("Token Expired");
    }
  }
  if (cache_valid) {
    request_ebay_listings(cached_auth, isbn, res);
  } else {
    let auth_sent_time = new Date();
    let authentication_req = https.request(
      options,
      function (authentication_res) {
        recieved_authentication(authentication_res, isbn, auth_sent_time, res);
      }
    );
    authentication_req.on("error", function (e) {
      console.log(e);
    });
    console.log("Requesting Token");
    authentication_req.end(post_data);
  }
}

/*
	Write a value to bestseller cache in the format:
	{ "YYYY-MM-DD_genre" : "isbn" }
*/
function write_Bestseller_Cache(user_input, isbn) {
  recordKey = `${user_input.daterange}_${user_input.genre}`;
  bestsellers = require(bestseller_cache);
  bestsellers[recordKey] = isbn;
  fs.writeFile(bestseller_cache, JSON.stringify(bestsellers), function (err) {
    if (err) {
      console.log(err);
    } else {
      console.log(`Bestseller Cache Written.`);
    }
  });
}

/*	
	Making API call to NYTimes (via API Key).
	Get the ISBN of the bestselling book.
	Write record to the bestseller cache.
	Call another function to get eBay information.
*/
function request_bestseller_information(user_input, res) {
  const endpoint = `http://api.nytimes.com/svc/books/v3/lists.json?api-key=${NYT_credentials["api-key"]}&list=${user_input.genre}&published-date=${user_input.daterange}`;
  const books_request = http.get(endpoint, { method: "GET" });
  books_request.once("response", process_stream);
  books_request.end();
  function process_stream(books_stream) {
    let books_data = "";
    books_stream.on("data", (chunk) => (books_data += chunk));
    books_stream.on("end", () => {
      let books_object = JSON.parse(books_data);
      if (books_object.num_results === 0) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.write("404 Not Found");
        res.end();
      } else {
        isbn = books_object.results[0].isbns[0].isbn10;
        write_Bestseller_Cache(user_input, isbn);
        request_ebay_information(isbn, res);
      }
    });
  }
}

server.on("request", connection_handler);
function connection_handler(req, res) {
  console.log(`New Request for ${req.url} from ${req.socket.remoteAddress}`);
  if (req.url === "/") {
    const main = fs.createReadStream("html/main.html");
    res.writeHead(200, { "Content-Type": "text/html" });
    main.pipe(res);
  } else if (req.url.startsWith("/search?")) {
    const user_input = url.parse(req.url, true).query;
    if (fs.existsSync(bestseller_cache)) {
      recordKey = `${user_input.daterange}_${user_input.genre}`;
      bestsellers = require(bestseller_cache);
      if (bestsellers.hasOwnProperty(recordKey)) {
        console.log(
          `Using Cached Value ${recordKey} : ${bestsellers[recordKey]}`
        );
        request_ebay_information(bestsellers[recordKey], res);
      } else {
        request_bestseller_information(user_input, res);
      }
    } else {
      content = `{}`;
      fs.writeFile(bestseller_cache, content, function (err) {
        if (err) {
          console.log(err);
        } else {
          console.log(`New Cache Created.`);
          request_bestseller_information(user_input, res);
        }
      });
    }
  } else if (req.url === "/images/nytimes_logo.png") {
    const main = fs.createReadStream("images/nytimes_logo.png");
    res.writeHead(200, { "Content-Type": "image/png" });
    main.pipe(res);
  } else if (req.url === "/images/ebay_logo.svg") {
    const main = fs.createReadStream("images/ebay_logo.svg");
    res.writeHead(200, { "Content-Type": "image/svg+xml" });
    main.pipe(res);
  } else if (req.url === "/images/placeholder.jpg") {
    const main = fs.createReadStream("images/placeholder.jpg");
    res.writeHead(200, { "Content-Type": "image/jpeg" });
    main.pipe(res);
  } else if (req.url === "/favicon.ico") {
    const main = fs.createReadStream("images/favicon.ico");
    res.writeHead(200, { "Content-Type": "image/x-icon" });
    main.pipe(res);
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.write("404 Not Found");
    res.end();
  }
}

server.on("listening", listening_handler);
server.listen(port);
function listening_handler() {
  console.log(`Now Listening on Port ${port}`);
}

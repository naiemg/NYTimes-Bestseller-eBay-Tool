# NYTimes-Bestseller-eBay-Tool

<div float="left">
  <img src="https://github.com/naiemg/NYTimes-Bestseller-eBay-Tool/blob/main/demo_gif_1.gif?raw=true" width="49%" />
  <img src="https://github.com/naiemg/NYTimes-Bestseller-eBay-Tool/blob/main/demo_gif_2.gif?raw=true" width="49%" /> 
</div>



## How it works
The user fills out a form specifying book genre & date. This is passed to a first API that gets the most popular book from the NY Times Best Sellers List [via API Key] for that genre and date.
<img src="https://github.com/naiemg/NYTimes-Bestseller-eBay-Tool/blob/main/demo_gif_1.gif?raw=true" width="60%" />

It gets the ISBN number for that book, which is then passed as a parameter to the eBay API [via OAuth 2.0 Client Credential], to gather all the listings for that book.
<img src="https://github.com/naiemg/NYTimes-Bestseller-eBay-Tool/blob/main/demo_gif_2.gif?raw=true" width="60%" /> 

## Sequence Diagram
Network diagram depicting the requests made to multiple servers (including headers) and the responses returned.


<img src="https://raw.githubusercontent.com/naiemg/NYTimes-Bestseller-eBay-Tool/2facd4091c8801d39a4ac4a20d0e5e2707536878/SequenceDiagram.svg?token=AIPG7RSGCL5M4AOZERZLY7LBJKUII" width="100%" /> 

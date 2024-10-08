# ai-scout-imageSearchComparison

Simple website to capture evaluation of different ways to search images.


A one-off load function in the admin part of the web server loads ~5000 images from the main pictures demo (ai-scout-pictures-something) which have descriptions generated by openAI

WORK IN PROGRESS - nothing to see here yet

## Web server

Typical node server.  Uses https because it makes sooky browsers complain less.  But github frets about even self-signed certs being exposed, so you'll have to recreate them yourself, something like:

```
(base) kfitch@hinton:~/pictures/web$ openssl genrsa -out key.pem
(base) kfitch@hinton:~/pictures/web$ openssl req -new -key key.pem -out csr.pem
You are about to be asked to enter information that will be incorporated
into your certificate request.
What you are about to enter is what is called a Distinguished Name or a DN.
There are quite a few fields but you can leave some blank
For some fields there will be a default value,
If you enter '.', the field will be left blank.
-----
Country Name (2 letter code) [AU]:
State or Province Name (full name) [Some-State]:ACT
Locality Name (eg, city) []:Canberra
Organization Name (eg, company) [Internet Widgits Pty Ltd]:NLA
Organizational Unit Name (eg, section) []:Digital
Common Name (e.g. server FQDN or YOUR name) []:hinton.nla.gov.au
Email Address []:kfitch@nla.gov.au

Please enter the following 'extra' attributes
to be sent with your certificate request
A challenge password []:
An optional company name []:
(base) kfitch@hinton:~/pictures/web$ openssl x509 -req -days 360 -in csr.pem -signkey key.pem -out cert.pem
Certificate request self-signature ok
subject=C = AU, ST = ACT, L = Canberra, O = NLA, OU = Digital, CN = hinton.nla.gov.au, emailAddress = kfitch@nla.gov.au
(base) kfitch@hinton:~/pictures/web$
```

This creates these files:

key.pem csr.pem cert.pem

The .env file defines the TCP port the node server will listen on, and how it can find SOLR and an embedding service.  Like the load programs, it must use CLIP to create embeddings from the queries so it can search SOLR for similar embeddings.

The node app was copied from an earlier newspapers demo.  The js packages I think are used are a typical set:

```
npm install express
npm install helmet
npm install body-parser
npm install axios
npm install dotenv
npm install cookie-parser
npm install http-errors
npm install log4js
npm install morgan
npm install rotating-file-stream
npm install ejs
npm install moment
npm install solr-client
```

run webserver like this

`node app.js`

## service

/etc/systemd/system/imageSearchComparisonNode.service


## SOLR schema

See SOLRschemas/managed-schema.xml



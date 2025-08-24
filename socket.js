const express = require('express');
const fs = require('fs')
const https = require('http')
const socketIO = require('socket.io');

const app = express()
const server = https.createServer(
    // {
    //     key: fs.readFileSync("key.pem"),
    //     cert: fs.readFileSync("cert.pem")
    // }, 
    app
)
const io = socketIO(server, {
    cors: {
        origin: "*",
        // credentials: true
    }
})

// const io = new Server(server, {
//     cors: {
//         origin: "*",
//         methods: ["GET", "POST"],
//         credentials: true
//     }
// })
module.exports = {app, server, io}
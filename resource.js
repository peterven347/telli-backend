const bodyParser = require("body-parser")
const express = require("express")
const mongoose = require("mongoose")
const path = require("path")
const { createServer } = require("http")
const { Server } = require("socket.io")
const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
      }
})
const userRoutes = require("./routes/user")

io.on("connection", (socket) => {
    const count = io.engine.clientsCount;
    const count2 = io.of("/").sockets.size;
    console.log(count, count2)
    socket.on("hello", (arg, callback) => {
        console.log(arg)
        // callback("got it")
    });
    socket.emit("hello", "worlfghjkd");

})

app.use('/domain_img', express.static(path.join(__dirname)));
app.use(bodyParser.json())

// app.use((req, res, next) => {
//     // res.header("Access-Control-Allow-Origin", "http://localhost:3000")
//     res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
//     res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With')
//     next()
// })
app.use("/t", (req, res) => {
    // var nn = os.networkInterfaces()
    // console.log(req.user-agent)
    console.log(req.headers['user-agent'])
    res.send(req.ip)
    // res.json({message: "welcome"})
    // res.redirect("http://localhost:3000")
})

app.use("/api/user", userRoutes)
  
app.get("/redirect", (req, res) => {
    res.send("redirect")
})

app.use((req, res) => {
    res.status(404).send("<h1>NOT FOUND!</h1>")
})

const DBoptions = {
    socketTimeoutMS: 30000,
    serverSelectionTimeoutMS: 35000,
}
mongoose.connect(process.env.MONGODB_URI,  DBoptions)
    .then(() => {
        httpServer.listen(3030, () => {
            console.log("server running... 3030")
    })
})

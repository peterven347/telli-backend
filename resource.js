const mongoose = require("mongoose")
const express = require("express")
const bodyParser = require("body-parser")
const app = express()
const MONGODB_URI = process.env.MONGODB_URI
const userRoutes = require("./routes/user")

app.use(bodyParser.json())

// app.use((req, res, next) => {
//     // res.header("Access-Control-Allow-Origin", "http://localhost:3000")
//     res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
//     res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With')
//     next()
// })
const os = require("os")
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
    dbName: "resource-pro",
    // user: 'username',
    // pass: 'password',
    socketTimeoutMS: 30000,
    serverSelectionTimeoutMS: 35000,
}
mongoose.connect(MONGODB_URI || "mongodb+srv://peter:xoWA84LysnyORc6g@cluster0.adqs0hh.mongodb.net/?authSource=admin", DBoptions)
    .then(() => {
        app.listen(3030, ()=>{
            console.log("server running... 3030")
    })
})

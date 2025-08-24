const express = require("express")
const mongoose = require("mongoose")
const path = require("path")
const { app, server, io } = require("./socket")

const userRoutes = require("./routes/user")
const { auth } = require("./middlewares/auth")

const serveImages = express.static(path.join(__dirname, 'files'));

app.use('/api/user/img-file', (req, res, next) => {
    return serveImages(req, res, next);
});
// http://localhost:3030/img_file/domainImg/1745156947702-nametest-1001337363.jpg
app.use(express.json())

// app.use((req, res, next) => {
//     // res.header("Access-Control-Allow-Origin", "http://localhost:3000")
//     res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
//     res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With')
//     next()
// })
app.get("/t", (req, res) => {
    // var nn = os.networkInterfaces()
    // console.log(req.user-agent)
    console.log(req.headers['user-agent'])
    res.send(req.ip)
    // res.json({message: "welcome"})
    // res.redirect("http://localhost:3000")
})

app.use("/api/user", userRoutes)

app.use((req, res) => { //auth
    res.status(404).send("<h1>NOT FOUND!</h1>")
})

const DBoptions = {
    socketTimeoutMS: 30000,
    serverSelectionTimeoutMS: 35000,
}

mongoose.connect("mongodb://localhost:27017/telli", DBoptions)
    .then(() => {
        server.listen(process.env.PORT || 3030, () => {
            console.log("server running... 3030")
        })
    }).catch((e) => { console.log(e) })

mongoose.connection.on("error", () => {
    console.log("mongoose error")
})

process.on('SIGINT', async () => {
    await mongoose.disconnect();
    console.log('Mongoose disconnected on app termination');
    process.exit(0);
});
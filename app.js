const express = require('express')
const app = express()
const http = require('http');
const server = http.createServer(app);

const {Server} = require("socket.io");
const io = new Server(server);

app.get("/", (req,res)=>{
    res.sendFile(__dirname+"/index.html");
});

io.on("connection", socket => {
    console.log(`user ${socket.id} is connected`)

    socket.on("chat message", (message, displayName) => {
        console.log(`message received in server = ${message}`)
        io.emit("send message", socket.id, message, displayName)
    })

    socket.on("typing", (displayName) => {
        const user = socket.id; 
        // if anyone is typing, send to all connected sockets
        io.emit("typing", socket.id, displayName)
    })

    socket.on("notTyping", (displayName) => {
        // if anyone is not typing, send to all connected sockets
        io.emit("notTyping", socket.id, displayName)
    })
    

    socket.on("disconnect", ()=>{
        console.log(`a user is disconnected`)
    })
})


server.listen(4000, ()=>{
    console.log("listening at port 4000");
})
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

    socket.on("chat message", message => {
        console.log(`message received in server = ${message}`)
        io.emit("send message", socket.id, message)
    })

    socket.on("typing", (msg) => {
        const user = socket.id;
        const newMessage = user + msg;
        // socket.emit("typing", newMessage)   
        // send to all connected sockets
        io.emit("typing", socket.id)
    })

    socket.on("notTyping", () => {
        io.emit("notTyping", socket.id)
    })
    

    socket.on("disconnect", ()=>{
        console.log(`a user is disconnected`)
    })
})


server.listen(4000, ()=>{
    console.log("listening at port 4000");
})
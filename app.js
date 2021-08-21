const e = require("express");
const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);

const { Server } = require("socket.io");
const io = new Server(server);

require("dotenv").config();
console.log(process.env.PORT);

let chatRoom = [];
let newChatRoom = {};
let newChatRoomArr = [];

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

io.on("connection", (socket) => {
  console.log(`user ${socket.id} is connected`);

  // initiaize when user first connect
  if (!chatRoom.includes(socket.id)) {
    chatRoom.push(socket.id);
    // newChatRoom[socket.id] = "";
    console.log(`chatRoom`);
    console.log(chatRoom);
    console.log(`newChatRoom`);
    console.log(newChatRoom);
    // user not yet set displayName, so will show socket.id first
    io.emit("chatRoom", chatRoom, newChatRoom, "someone has connected");
  }

  socket.on("chat message", (message, displayName) => {
    // console.log(`message received in server = ${message}`)
    console.log(`displayName = ${displayName}`);
    let socketId = socket.id;
    let newDisplayName = displayName;
    let num = 1;
    // if already got this user name
    if (newChatRoom[socketId] === undefined || newChatRoom[socketId] === "") {
      console.log(`the newChatRoom dont have this socketId`);
      while (newChatRoomArr.includes(newDisplayName)) {
        newDisplayName = displayName + "" + num;
        num++;
      }
    }

    // reset
    num = 1;
    newChatRoom[socketId] = newDisplayName;
    newChatRoomArr = [];

    console.log(newChatRoom);
    for (let socketId in newChatRoom) {
      let existedName = newChatRoom[socketId];
      newChatRoomArr.push(existedName);
    }

    console.log(chatRoom);
    console.log(newChatRoomArr);
    console.log(newChatRoom);
    io.emit("send message", socket.id, message, newDisplayName);
    // only when send message will update the displayName in chatRoom
    io.emit(
      "chatRoom",
      chatRoom,
      newChatRoom,
      "update the displayName in chatRoom"
    );
  });

  socket.on("typing", (displayName) => {
    // check if newchatRoom has this userName, if no
    const user = socket.id;
    let newDisplayName = displayName;
    if (newChatRoom[user] === undefined) {
      newDisplayName = displayName;
    } else {
      newDisplayName = newChatRoom[user];
    }

    // if anyone is typing, send to all connected sockets
    io.emit("typing", socket.id, newDisplayName);
  });

  socket.on("notTyping", (displayName) => {
    // check if newchatRoom has this userName, if no
    const user = socket.id;
    let newDisplayName = displayName;
    if (newChatRoom[user] === undefined) {
      newDisplayName = displayName;
    } else {
      newDisplayName = newChatRoom[user];
    }

    // if anyone is not typing, send to all connected sockets
    io.emit("notTyping", socket.id, newDisplayName);
  });

  socket.on("disconnect", () => {
    console.log(`a user is disconnected`);
    // remove a user in chatroom
    console.log(`disconnectUser = ${socket.id}`);
    chatRoom = chatRoom.filter((each) => {
      return each !== socket.id;
    });
    console.log(chatRoom);
    delete newChatRoom[socket.id];
    // for (let each of chatRoom) {
    //   if (newChatRoom[each] === undefined) {
    //     newChatRoom[each] = "";
    //   }
    // }
    console.log(`newChatRoom`);
    console.log(newChatRoom);
    io.emit("chatRoom", chatRoom, newChatRoom, "someone is disconnected");
  });
});

server.listen(process.env.PORT, () => {
  console.log(`listening at port ${process.env.PORT}`);
});

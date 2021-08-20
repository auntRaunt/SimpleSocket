"use strict";

var SocketIO = require('socket.io');
var socketioWildcard = require('socketio-wildcard')();
var nconf = require('nconf');
var winston = require('winston');
var redis = require('socket.io-redis');
var myip = require('ip');
var docClient = require('../database/index');
var endpoint = nconf.get('redis').endpoint;
var reserve_time = nconf.get('timer').reserve_time;

var clientclass = require('../client');
var common = require('../common/index');
var event = require('../event');
var sicboEvent = nconf.get('event').sicbo.split("|")
var vipEvent = nconf.get('event').vip.split("|");
var baccartEvent = nconf.get('event').baccart.split("|");
var quickbaccartEvent = nconf.get('event').quickbaccart.split("|");
var quicksicboEvent = nconf.get('event').quicksicbo.split("|");
var agentEvent = nconf.get('event').agent.split("|");
var clientEvent = nconf.get('event').client.split("|");
var roadmapEvent = nconf.get('event').roadmap.split("|");
var threecardsEvent = nconf.get('event').threecards.split("|");
var pairbullEvent = nconf.get('event').pairbull.split("|");
var holdemEvent = nconf.get('event').holdem.split("|");
var threepokerEvent = nconf.get('event').threepoker.split("|");
var jongnineEvent = nconf.get('event').jongnine.split("|");
var threecards_pveEvent = nconf.get('event').threecards_pve.split("|");
var vip_assistEvent = nconf.get('event').vip_assist.split("|");

var game_type_threecards = nconf.get('config').game_type_threecards;
var game_type_pairbull = nconf.get('config').game_type_pairbull;
var game_type_holdem = nconf.get('config').game_type_holdem;
var game_type_jongnine = nconf.get('config').game_type_jongnine;
var game_type_threecards_pve = nconf.get('config').game_type_threecards_pve;
var live_vip_local_ip = nconf.get('config').live_vip_local_ip;
var live_vip_local_event = nconf.get('config').live_vip_local_event;

var receiveMessageStringSize = 1024 * 4; // a max size of 4KB message length

var gameControllObj = {
	"1": { event: baccartEvent, classPath: "./baccarat" },
	"4": { event: vipEvent, classPath: "./vip" },
	"5": { event: sicboEvent, classPath: "./sicbo" },
	"6": { event: quickbaccartEvent, classPath: "./quickbaccarat" },
	"7": { event: quicksicboEvent, classPath: "./quicksicbo" },
	"10": { event: threecardsEvent, classPath: "./threecards" },
	"11": { event: pairbullEvent, classPath: "./pairbull" },
	"12": { event: holdemEvent, classPath: "./holdem" },
	"13": { event: threepokerEvent, classPath: "./threepoker" },
	"14": { event: jongnineEvent, classPath: "./jongnine" },
	"15": { event: threecards_pveEvent, classPath: "./threecards_pve" },
	"16": { event: vip_assistEvent, classPath: "./vip_assist" },
};

var Sockets = {};
var io;

var dateFormat = require('dateformat');
var _log = console.log;
console.log = function (text) {
	var now = new Date();
	var displayDate = dateFormat(now, "yyyy-mm-dd HH:MM:ss l");
	var logLineDetail = ((new Error().stack).split("at ")[2]).trim();
	var tempDetails = logLineDetail.split("/");
	var folderName = tempDetails[tempDetails.length - 2];
	var scriptName = tempDetails[tempDetails.length - 1].substr(0);
	var displayScriptName = scriptName.substr(0, scriptName.length - 1);
	if (folderName == 'commonlog') {
		logLineDetail = ((new Error().stack).split("at ")[2]).trim();
		tempDetails = logLineDetail.split("/");
		folderName = tempDetails[tempDetails.length - 2];
		scriptName = tempDetails[tempDetails.length - 1].substr(0);
		displayScriptName = scriptName.substr(0, scriptName.length - 1);
	}

	//if (folderName == 'socket') { // control socket log
		_log("[" + displayDate + "][" + folderName + "][" + displayScriptName + "] : " + text);
	//}
};


Sockets.init = function (server) {

	winston.info('[socket] Initialing socket server [index]');

	io = SocketIO.listen(server, { transports: ['websocket'] });
	io.adapter(redis({ host: endpoint, requestsTimeout: 10 }));

	io.use(socketioWildcard);

	io.set('heartbeat timeout', 10000);
	io.set('heartbeat interval', 2000);

	io.on('connection', function (socket) {

		//		console.log('[Socket] onConnect:' + socket.id);
		onConnect(socket);

		socket.on('disconnect', async function (data) {

			await onDisconnect(socket, data);
			//showAllRedisRooms();
		});

		socket.on('*', async function (packet) {

			try {
				var event = packet.data[0];
				var msg = packet.data[1];
				var clientIP = socket.conn.transport.socket._socket.remoteAddress;
				//console.log("Received MSG: " + msg);
				//console.log("Event: " + event);
				try {
					if (typeof msg == 'string' && msg.length <= receiveMessageStringSize)
						msg = JSON.parse(msg);
					else {
						console.log('[socket] Received message from client:' + socket.id + ' - not valid JSON format, disconnect from server(1).');
						//socket.disconnect();
						return;
					}
				} catch (e) {
					console.log(e);
					console.log('[socket] Received message from client:' + socket.id + ' - not valid JSON format, disconnect from server(2).');
					//socket.disconnect();
					return;
				}

				console.log('[Socket] event:' + event + ' , msg:' + JSON.stringify(msg));

				//client DDos check
				if (!checkMessageEntry(socket, msg.guid)) {
					console.log("Double message:" + JSON.stringify(msg));
					await receiveLog(event, msg);
					return;
				}
				else {
					addRatingEntry(socket, event);
				}

				if (!evalRating(socket)) {
					var reason = '[Socket] client:' + socket.id + ' DDoS, disconnect from server.';
					await disconnectClientManyMessage(clientIP, socket.id, event, msg, reason);
					//socket.disconnect();
					console.log(reason);
					return;
				}
				else {
					addBetRatingEntry(socket, event);
				}

				if (!evalBetRating(socket)) {

					var reason = '[Socket] client:' + socket.id + ' bet DDoS, disconnect from server.';
					await disconnectClientManyMessage(clientIP, socket.id, event, msg, reason);
					//socket.disconnect();
					console.log(reason);
					return;
				}

				var re = /[:, f]/gi;
				var ip = socket.handshake.address;
				ip = ip.replace(re, "");
				console.log(' Connection Client IP ====>  ' + ip);
				//console.log('eveettt ' + event);
				//if (live_vip_local_event.includes(event) && ip != live_vip_local_ip) { throw new Error(731); } // Disabled for testing

				if (event.startsWith('client.') && checkEvent(clientEvent, event))
					require('./client')[event](io, socket, msg);
				else if (event.startsWith('roadmap.') && checkEvent(roadmapEvent, event))
					require('./roadmap')[event](io, socket, msg);
				else if (event.startsWith('agent.') && checkEvent(agentEvent, event))
					require('./agent')[event](io, socket, msg);
				else if (event.startsWith('game.')) { // #####Check for table variable

					var odie = {};

					var params = {
						TableName: "dealer_table",
						Select: 'ALL_ATTRIBUTES'
					};

					if (typeof msg.gametype != 'undefined' && typeof msg.gametype == 'number' && (msg.gametype == game_type_threecards || msg.gametype == game_type_pairbull
						|| msg.gametype == game_type_holdem || msg.gametype == game_type_jongnine)) {
						params.IndexName = "status-type-index";
						params.KeyConditionExpression = "#status = :status and #type = :type";
						params.ExpressionAttributeNames = { "#status": "status", "#type": "type" };
						params.ExpressionAttributeValues = { ":status": Number(1), ":type": Number(msg.gametype) };
					}
					else if (typeof msg.table != 'undefined' && typeof msg.table == 'number') {
						params.KeyConditionExpression = "#table = :table";
						params.ExpressionAttributeNames = { "#table": "table", "#status": "status" };
						params.ExpressionAttributeValues = { ":table": Number(msg.table), ":status": Number(1) };
						params.FilterExpression = "#status = :status";
					}

					odie = await docClient.query(params);

					if (odie.Count == 0) { throw new Error(647); }

					//console.log('+++++ ' + JSON.stringify(odie));

					if (checkEvent(gameControllObj[odie.Items[0].type].event, event)) {
						//if(odie.Items[0].type == 4) await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * Math.floor(4) + 7) * 1000)); // Testing
						console.log("====> : event _ type  : " + event + ' _  ' + odie.Items[0].type);
						require(gameControllObj[odie.Items[0].type].classPath)[event](io, socket, msg);
					} else {
						throw new Error(703);
					}
				}
				else {
					throw new Error(703);
				}
			}
			catch (err) {
				common.onError(io, socket, err);
			}

		});

	});

	Sockets.socket = io;

}


var messRating = {}; // rating: {* "socketid1":"guid" , "socketid2":"guid", "socketid3":"guid" }

function checkMessageEntry(socket, guid) {
	// Returns entry object.
	var lastguid = '';
	var result = true;

	lastguid = messRating[socket.id];

	if (lastguid == 'undefined')
		lastguid = '';

	if (lastguid == guid)
		result = false;
	else {
		messRating[socket.id] = guid;
		result = true;
	}

	return result;
}

async function receiveLog(event, msg) {
	var time2live = common.gen_ttl(10080 * 60000); //Math.floor((new Date().getTime() + 10080 * 60000) / 1000);
	var key = Math.floor((new Date().getTime())).toString() + '_' + msg.client;

	var params = {
		TableName: "client_receive_log",
		Key: {
			"receive_key": key
		},
		ExpressionAttributeNames: {
			"#event": "event",
			"#keepTo": "keepTo",
			"#msg": "msg",
			"#client": "client",
			"#guid": "guid"
		},
		ExpressionAttributeValues: {
			":event": event,
			":keepTo": time2live,
			":msg": JSON.stringify(msg),
			":client": msg.client,
			":guid": msg.guid
		},
		UpdateExpression: "set #event = :event, #keepTo = :keepTo, #guid = :guid, #msg = :msg, #client = :client",
		ReturnValues: "ALL_NEW"
	};

	var result = await docClient.update(params);
	console.log(JSON.stringify(result));
}

//var check = {};
var rating, limit, interval;
rating = {}; // rating: {* "socketid":[{'timestamp', 'event'} , {'timestamp', 'event'}], "socketid":[['timestamp', 'event'] , ['timestamp', 'event']] }
limit = 50; // limit: number of message.
interval = 1000; // interval: interval in milliseconds.

var betRating, betLimit, betInterval;
betRating = {}; // rating: {* "socketid":[{'timestamp', 'event'} , {'timestamp', 'event'}], "socketid":[['timestamp', 'event'] , ['timestamp', 'event']] }
betLimit = 1; // limit: number of message.
betInterval = 200; // interval: interval in milliseconds.

function addBetRatingEntry(socket, eventName) {

	if (eventName == 'game.bet' || eventName == 'game.insurance_bet'
		|| eventName == 'game.join' || eventName == 'game.req_next'
		|| eventName == 'game.sidebet' || eventName == 'game.bet_raise'
		|| eventName == 'game.select_seats' || eventName == 'game.switch_table'
		|| eventName == 'game.switch_range' || eventName == 'game.join_reserved') {
		var eventList = [];
		eventList = betRating[socket.id];
		eventList.push({ 'timestamp': Date.now(), 'eventName': eventName });
		betRating[socket.id] = eventList;
	}
}

function evalBetRating(socket) {

	var i, newRating;

	var eventList = betRating[socket.id];

	newRating = [];

	for (i = eventList.length - 1; i >= 0; i -= 1) {
		if ((Date.now() - eventList[i].timestamp) < betInterval) {
			newRating.push(eventList[i]);
		}
	}

	betRating[socket.id] = newRating;

	return (newRating.length > betLimit ? false : true);
}

function addRatingEntry(socket, eventName) {

	//	if(eventName == 'roadmap.join' || eventName == 'roadmap.leave' 
	//		|| eventName == 'game.squeezecard' || eventName == 'roadmap.bet_range' 
	//			|| eventName == 'client.get_oneplusone_package' || eventName == 'roadmap.tables'
	//				|| eventName == 'roadmap.tables' || eventName == 'client.bet_history' 
	//					|| eventName == 'roadmap.in_seat' || eventName == 'client.game_allow')
	//		return;

	// Returns entry object.
	var eventList = [];
	eventList = rating[socket.id];
	eventList.push({ 'timestamp': Date.now(), 'eventName': eventName });
	rating[socket.id] = eventList;

}

function evalRating(socket) {

	var i, newRating;

	var eventList = rating[socket.id];

	newRating = [];

	for (i = eventList.length - 1; i >= 0; i -= 1) {
		if ((Date.now() - eventList[i].timestamp) < interval) {
			newRating.push(eventList[i]);
		}
	}

	rating[socket.id] = newRating;

	return (newRating.length > limit ? false : true);
}

function onConnect(socket) {
	console.log('[socket] onConnect:' + socket.id);

	rating[socket.id] = [];
	betRating[socket.id] = [];

	//console.log('socket.id rating[socket.id]:' + JSON.stringify(rating[socket.id]));
	//console.log('socket.id betRating[socket.id]:' + JSON.stringify(betRating[socket.id]));
}

async function onDisconnect(socket, data) {

	delete messRating[socket.id];
	delete rating[socket.id];
	delete betRating[socket.id];
	console.log('[socket] onDisconnect:' + socket.id + ' data:' + data);

	let deviceInfo = await queryDeviceTypeBySocketId(socket.id);

	console.log('[socket] onDisconnect deviceInfo : ' + JSON.stringify(deviceInfo));

	let devicetype = deviceInfo.devicetype;

	let table = deviceInfo.table;

	if (devicetype == "fighter") {
		try {
			let clientSeatInfo = await removeFighterClientSeatSocketid(socket.id, table);
			//if(clientSeatInfo) await keepVIPRoomForFighter(clientSeatInfo);
			await removeFromDeviceMapping(socket.id, table);
			console.log("=====> table : " + table + ' fighter device socketid  removed...');
		}
		catch (err) {
			console.log("fighter error : " + err);
		}
	}
	else if (devicetype == "comm") {
		await removeFromDeviceMapping(socket.id, table);
		console.log("=====> table : " + table + ' comm socketid  removed...');
	}
	else {
		try {
			await common.logOut(socket.id);
		} catch (err) {
			console.log("common.logOut error : " + err);
		}

		//transport close/error - apps crush
		//client namespace disconnect - client call socket.close
		//server namespace disconnect - server call socket.close
		//ping timeout - disconnect network

		if (data != 'undefined' && data != 'client namespace disconnect' && data != 'server namespace disconnect') { //&& data != 'transport error' && data != 'transport close'
			//if (data != 'undefined' && data != 'client namespace disconnect' && data != 'server namespace disconnect' && data != 'transport error') { //  For testing, kill tester to transport close
			await keepVIPRoomForReserve(socket.id); // Only gametype 4 reserve room in Online mode
		}

		await cleartoken(socket.id);
	}
}

async function cleartoken(socketid) // also clear socketid
{
	await clientclass.cleartoken(socketid);
	console.log('[Socket] cleartoken for socketid:' + socketid);
	//clear token for all disconnected client
}

module.exports = Sockets;
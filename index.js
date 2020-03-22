//remember, all work should be done by server, client should do minimal work!

// ************************ REQUIRE STATEMENTS AND APP SETUP
var express = require('express');
var bodyParser = require('body-parser');
var upload = require('multer')();
var path = require('path');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

var constants = require('./constants/constants.js');

app.set('view engine', 'pug'); //don't these have to come before doing res.render(form)...?
app.set('views', './views');
app.use(bodyParser.json()); 
app.use(bodyParser.urlencoded({ extended: true })); 
app.use(upload.array()); 

app.use('/play', express.static(path.join(__dirname + '/images/')));
// ************************ END REQUIRE STATEMENTS AND APP SETUP

// ** Game settings
let numDecks = -1;
let gameID = "";
let numPlayers = -1;
let kittySize = -1;
let kittyCards = []; //string of cards, sorted
let players = [];
let sockIDtoPlayer = {};
let currentStarter = undefined; //type: Player
let currTrumpSuit = ""; //type: string 
// ("clubs", "diamonds", "hearts", "spades", "notrump")
let currTrumpRank = "3";

// ** For dealing cards
let currCard = 0;
let indices = undefined;

// console.log(constants.allCardsObj);

class Player{
    constructor(name){
        this.m_name = name;
        this.m_socketID = "";
        this.m_team = -1;
        this.m_gameID = "";
        this.m_validated = false;
        this.m_cards = {
            "clubs": [], //array stores card objects
            "diamonds": [],
            "hearts": [],
            "spades": [],
            "trumps": []
        };
    }

    setSocketID(socketID){
        this.m_socketID = socketID;
    }

    getSocketID(){
        return this.m_socketID;
    }

    setTeam(teamNum){   
        if(teamNum !== 1 && teamNum !== 2){
            return false;
        }    
        this.m_team = teamNum;
        return true;
    }

    getTeam(){
        return this.m_team;
    }

    getName(){
        return this.m_name;
    }

    addCardToHand(cardObj){
        this.m_cards[cardObj.suit].push(cardObj);
        this.sortCurrCards();
        // this.printCurrCards();
    }

    removeCardFromHand(cardObj){
        var i = 0;
        for(; i<this.m_cards[cardObj.suit].length; i++){
            if(this.m_cards[cardObj.suit][i].rank === cardObj.rank){
                break;
            }
        }
        this.m_cards[cardObj.suit].splice(i, 1);
        // console.log("After deletion:");
        this.sortCurrCards();
        // this.printCurrCards();
    }

    printCurrCards(){
        console.log(this.m_cards["clubs"]);
        console.log(this.m_cards["diamonds"]);
        console.log(this.m_cards["hearts"]);
        console.log(this.m_cards["spades"]);
        console.log(this.m_cards["trumps"]);
    }

    sortCurrCards(){
        Object.keys(this.m_cards).forEach(suit => {
            this.m_cards[suit].sort(function(a, b){
                return (constants.ordering[a.rank] - constants.ordering[b.rank]);
            });
        });

        //further sorting if we know trump rank and suit
        if(currTrumpSuit !== "" && currTrumpRank !== ""){

            //save and sort jokers
            var jokers = [];
            for(let i = 0; i<this.m_cards["trumps"].length; i++){
                if(this.m_cards["trumps"][i].rank === "red_joker" || 
                this.m_cards["trumps"][i].rank === "black_joker"){
                    jokers.push(this.m_cards["trumps"][i]);
                }
            }
            jokers.sort(function(a,b){
                return a.rank > b.rank;
            })
    
            this.m_cards["trumps"] = []; //clear out all trump cards
            
            var adjustedTrumps = [];
            if(currTrumpSuit !== "notrump"){
                for(let i = 0; i<this.m_cards[currTrumpSuit].length; i++){
                    if(this.m_cards[currTrumpSuit][i].rank !== currTrumpRank){
                        //this if to avoid double counting card that is 
                        //trump rank and trump suit
                        adjustedTrumps.push(this.m_cards[currTrumpSuit][i]);
                    }
                    
                }
            }
            var trumpRankAndSuit = [];
            Object.keys(this.m_cards).forEach(suit => {
                this.m_cards[suit].forEach(card => {
                    if(card.rank === currTrumpRank){
                        if(card.suit === currTrumpSuit){
                            trumpRankAndSuit.push(card);
                        }
                        else{
                            adjustedTrumps.push(card);
                        }
                    }
                });
            });
    
            trumpRankAndSuit.forEach(card =>{
                adjustedTrumps.push(card);
            })
    
            jokers.forEach(card =>{
                adjustedTrumps.push(card);
            })
    
            this.m_cards["trumps"] = adjustedTrumps;
            // console.log(this.m_cards["trumps"]);
        }
        
    }

    flattenCardArrayRetString(){
        let result = [];
        let allSuits = Object.keys(this.m_cards);
        for(let i = 0; i<allSuits.length; i++){
            if(allSuits[i] !== currTrumpSuit){ //copy 3 suits + trump suit                
                for(let j = 0; j<this.m_cards[allSuits[i]].length; j++){
                    if(allSuits[i] === "trumps"){
                        // console.log("In flatten cards");
                        // console.log(this.m_cards[allSuits[i]]);
                        result.push(constants.cardObjToStr(this.m_cards[allSuits[i]][j]));
                    }
                    else if(this.m_cards[allSuits[i]][j].rank !== currTrumpRank){
                        result.push(constants.cardObjToStr(this.m_cards[allSuits[i]][j]));
                    }                
                }
            }
        }
        // console.log(result);
        return result;
    }
}

app.get('/image1', function(req, res){
    res.sendFile(__dirname + '/imagePage.html');
})

app.get('/', function(req, res){
    if(gameID === undefined || gameID === ""){
        res.render('home_page', {createGame: true});
    }
    else{
        res.render('home_page', {createGame: false});
    }
});

app.post('/', function(req, res){
    console.log(req.body);
    console.log(parseInt(req.body.numDecks));
    if(gameID === undefined || gameID === ""){
        //creating a new game
        if(!req.body.numDecks || !req.body.numPlayers || !req.body.kittySize || 
            !req.body.numPlayers.match(/^[0-9]*[02468]$/) || 
            !req.body.numDecks.match(/^[0-9]*$/) || 
            !req.body.kittySize.match(/^[0-9]*$/) ){
            res.render('home_page', {message: "Error in an input field", createGame: true});
        }
        else if( (parseInt(req.body.numDecks)*54-parseInt(req.body.kittySize)) % parseInt(req.body.numPlayers) !== 0){
            console.log("Game id set to " + gameID);  
            console.log("Kitty size error");         
            res.render('home_page', {message: "Incorrect kitty size", createGame: true});
        }
        else{
            numDecks = parseInt(req.body.numDecks);
            gameID = req.body.gameID; //unique game identifier
            numPlayers = parseInt(req.body.numPlayers);
            kittySize = parseInt(req.body.kittySize);
            
            indices = [...Array(54*req.body.numDecks).keys()];
            constants.shuffleArray(indices);
            console.log(indices.length + " cards randomized!");
            console.log("Game ID: " +gameID);
            res.redirect("/");
        } 
    }
    else{
        if(req.body.gameID !== gameID){
            res.render('home_page', {message: "Invalid game ID", createGame: false});
        }
        else{
            //to do: no duplicate players allowed
            players.push(new Player(req.body.playerName));
            res.redirect('/play/'+gameID+req.body.playerName);
        }
    }
});

function assocSockIDwithName(playerName, playerTeam, socketID){
    for(let i = 0; i<players.length; i++){
        var player = players[i];
        if(player.getTeam() === -1 && playerName === player.getName()){
            player.setSocketID(socketID);
            player.setTeam(parseInt(playerTeam))
            sockIDtoPlayer[socketID] = player;
            console.log(sockIDtoPlayer);
            console.log(player);
            console.log("Name " + playerName +" and team " + playerTeam + " set for " + socketID);
            return true;
        }
    }
    return false;
}

function isSocketAssociated(socketID){
    for(let i = 0; i<players.length; i++){
        if(players[i].getSocketID() === socketID){
            return true;
        }
    }
    return false;
}

app.get('/play/:id', function(req, res){
    //TODO: convert this to cookie? Not sure better or worse
    if(gameID === ""){
        res.redirect('/nonexistent');
    }
    else if(req.params.id.substr(0, gameID.length) !== gameID){
        res.redirect('/nonexistent');
    }
    else{
        res.sendFile(__dirname + "/index.html");
    }
});

io.on('connection', function(socket){
    console.log("A user has connected, socket id " + socket.id);
    
    socket.on('disconnect', function(){
        //to do: diassociate socket id with player to allow for reconnections
        console.log('user disconnected');
    });
    socket.on('chat message', function(msg){
        console.log('message sent: ' + msg);

        //don't accept messages until player self-identifies
        if(!isSocketAssociated(socket.id)){
            //if we have not connected socket to a player...
            console.log("Trying to associating socket with player...");
            let commaLoc = msg.indexOf(",");
            if(!assocSockIDwithName(
                                    msg.substr(0, commaLoc), 
                                    msg.substr(commaLoc+1, msg.length),
                                    socket.id)
                                    )
            {
                    socket.emit('chat message', "Private Msg: ERROR: invalid name or team, try again");
            }
            else{
                socket.emit('chat message', "Private Msg: SUCCESS: name and team set");
            }
        }
        else{
            io.emit('chat message', msg); //broadcast to everyone
        }
    });

    socket.on('draw card', function(sockId){
        //implement turn-based logic here: can't draw until it's your turn
        if(currCard < 54*numDecks-kittySize){
            let index = currCard;
            console.log(index);
            selectedCardStr = constants.allCards[indices[index]%54];
            selectedCardObj = constants.allCardsObj[indices[index]%54];
            
            sockIDtoPlayer[sockId].addCardToHand(selectedCardObj);
            console.log("Dealt card " + selectedCardStr + " to player " + sockId);
            // socket.emit('serve draw card', selectedCardStr);
            socket.emit('serve card array', sockIDtoPlayer[sockId].flattenCardArrayRetString());
            currCard += 1;
        }
        else{
            sockIDtoPlayer[sockId].sortCurrCards();
            socket.emit('serve card array', sockIDtoPlayer[sockId].flattenCardArrayRetString());
            console.log("No more cards to draw!");
        }      
    });

    socket.on('request card', function(cardReq){
        //not for actual play, for debugging purposes
        if(cardReq === "all cards"){
            console.log("sending over all cards");
            socket.emit('serve card array', constants.allCards);
        }

        if(cardReq === "red_joker" || cardReq === "black_joker"){
            console.log("socket " + socket.id + " requested card " + cardReq);
            socket.emit('serve card request', cardReq);
        }
        else if(cardReq.match(/_of_/)){
            let firstUS = cardReq.indexOf("_");
            let secondUS = cardReq.indexOf("_", firstUS+1);
            if(cardReq.indexOf("_", secondUS+1) === -1 && 
                constants.ranks.has(cardReq.substring(0, firstUS)) &&
                constants.suits.has(cardReq.substring(secondUS+1, cardReq.length))){
                    console.log("socket " + socket.id + " requested card " + cardReq);
                    socket.emit('serve card request', cardReq);             
            }
        }
    });

    socket.on('set game settings', function(starterChecked, trumpSuit, trumpRank){
        console.log(starterChecked + " " + trumpSuit);
        if(starterChecked === "starter"){
            currentStarter = sockIDtoPlayer[socket.id];
            io.emit('chat message', 'Player ' + sockIDtoPlayer[socket.id].getName() + " is now the starter");
            socket.broadcast.emit('uncheck starter');
        }
        if(trumpSuit !== undefined){
            currTrumpSuit = trumpSuit;
            io.emit('chat message', "The trump suit is now " + trumpSuit);
            io.emit('set trump suit', trumpSuit);
        }
        if(trumpRank !== undefined && trumpRank !== ""){
            currTrumpRank = trumpRank;
            io.emit('chat message', "The trump rank is now " + trumpRank);
            io.emit('set trump rank', trumpRank);
        }
    });

    socket.on('draw kitty', function(sockId){
        console.log("Attemping on server side");
        if(currCard >= 54*numDecks-kittySize && currCard<54*numDecks){
            console.log("Drawing from kitty");
            while(currCard<54*numDecks){
                let index = currCard;
                console.log(index);
                selectedCardStr = constants.allCards[indices[index]%54];
                selectedCardObj = constants.allCardsObj[indices[index]%54];
                
                sockIDtoPlayer[sockId].addCardToHand(selectedCardObj);
                console.log("Dealt kitty card " + selectedCardStr + " to player " + sockId);
                // socket.emit('serve draw card', selectedCardStr);
                socket.emit('serve card array', sockIDtoPlayer[sockId].flattenCardArrayRetString());
                currCard += 1;
            }
            socket.emit('kitty no draw yes set aside', kittySize);
            io.emit('chat message', "Player " + sockIDtoPlayer[sockId].getName() + " has drawn the kitty");
        }
    });

    socket.on('set aside kitty', function(setAsideCards){
        if(setAsideCards.length !== kittySize){
            socket.emit('chat message', "Private Msg: ERROR: Incorrect kitty size");
        }
        else{
            kittyCards = setAsideCards;
            io.emit('chat message', "Player " + sockIDtoPlayer[socket.id].getName() + " has set aside the kitty");
            for(let i = 0; i< setAsideCards.length; i++){
                // console.log(setAsideCards[i]);
                sockIDtoPlayer[socket.id].removeCardFromHand(constants.cardStrToObj(setAsideCards[i]));
                // io.emit('chat message', playCardReq[i]);
            }
        }
    });

    socket.on('play card req', function(playCardReq){
        console.log("Got card play request from " + socket.id);
        io.emit('chat message', "Player " + sockIDtoPlayer[socket.id].getName() + " played:");
        for(let i = 0; i< playCardReq.length; i++){
            // console.log(playCardReq[i]);
            sockIDtoPlayer[socket.id].removeCardFromHand(constants.cardStrToObj(playCardReq[i]));
            io.emit('chat message', playCardReq[i]);
        }
    });
    socket.on('undo card play', function(playCardReq){
        console.log("Got card play request from " + socket.id);
        io.emit('chat message', "Player " + sockIDtoPlayer[socket.id].getName() + " undid play with following cards:");
        for(let i = 0; i< playCardReq.length; i++){
            sockIDtoPlayer[socket.id].addCardToHand(constants.cardStrToObj(playCardReq[i]));
            // console.log(playCardReq[i]);
            io.emit('chat message', playCardReq[i]);
        }
    })
    //emit only to that socket
    socket.emit('chat message', 'Welcome, enter your name and team in the format <name>,<team (1 or 2)>');
});

app.get('*', function(req, res){
    //res = response
    res.send("Invalid URL: page not found.");
});


http.listen(3000, function(){
    console.log('Listening on port 3000');
});
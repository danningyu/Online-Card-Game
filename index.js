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


let port = process.env.PORT || 3000;

app.set('view engine', 'pug');
app.set('views', './views');
app.use(bodyParser.json()); 
app.use(bodyParser.urlencoded({ extended: true })); 
app.use(upload.array()); 

app.use('/play', express.static(path.join(__dirname + '/images/')));
app.use('/play', express.static(path.join(__dirname + '/')));
// ************************ END REQUIRE STATEMENTS AND APP SETUP

const debug = 0;

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
let currTrumpRank = "";
let playerIndices = [];
let gameState = 0; //0 for drawing, 1 for playing

// ** For dealing cards
let currCard = 0;
let indices = undefined;
let currPlayerAllowedToDraw = 0;

// -------------------- START HELPER FUNCTIONS --------------------
function incTurnToNextPlayer(){
    currPlayerAllowedToDraw = (currPlayerAllowedToDraw+1)%numPlayers;
    return currPlayerAllowedToDraw;
}

function setCurrPlayerTurn(sockId){
    let i = 0;
    for(; i<players.length; i++){
        if(players[i] !== undefined && players[i].getSocketID === sockId){
            currPlayerAllowedToDraw = players[i].getNumber();
            return true;
        }
    }
    return false;
}

//to do: create a singleton class that's basically a wrapper for all the players...
function allPlayersPresent(){
    if(numPlayers !== players.length){
        return false;
    }
    for(let i = 0; i<players.length; i++){    
        if(players[i] == undefined || players[i] == null || players[i].getSocketID() == ""){
            return false;
        }
    }
    return true;
}

function assocSockIDwithName(playerName, socketID){
    if(debug){
        console.log(players);
    }
    
    for(let i = 0; i<players.length; i++){
        var player = players[i];
        if(players[i] !== undefined && playerName === player.getName()){
            player.setSocketID(socketID);
            sockIDtoPlayer[socketID] = player;
            if(debug){
                console.log(sockIDtoPlayer);
                console.log(player);
                console.log("Name " + playerName + " set for " + socketID);
            }           
            return true;          
        }
        
    }
    return false;
}

function isSocketAssociated(socketID){
    for(let i = 0; i<players.length; i++){
        if(players[i] != undefined && players[i].getSocketID() === socketID){
            return true;
        }      
    }
    return false;
}

function getPlayerNamesAndNumbers(){
    var playerNamesAndNumbers = [];
    for(let i = 0; i<players.length; i++){
        if(players[i] !== undefined){
            playerNamesAndNumbers[players[i].getNumber()] = new Object({
                name: players[i].getName(),
                number: players[i].getNumber()
            });
        }       
    } // end for loop
    return playerNamesAndNumbers;
}

// -------------------- END HELPER FUNCTIONS --------------------

class Player{
    constructor(name, playerNum){
        this.m_name = name;
        this.m_socketID = "";
        this.m_team = -1;
        this.m_playerNum = playerNum;
        // this.m_gameID = ""; //not used at the moment
        // this.m_validated = false; //not used at the moment
        this.m_cards = {
            "clubs": [], //array stores card objects
            "diamonds": [],
            "hearts": [],
            "spades": [],
            "trumps": [] //jokers + trump suit + trump rank cards
        };
    }

    setSocketID(socketID){ this.m_socketID = socketID; }

    getSocketID(){ return this.m_socketID; }

    setTeam(teamNum){   
        if(teamNum !== 1 && teamNum !== 2){
            return false;
        }    
        this.m_team = teamNum;
        return true;
    }

    getTeam(){ return this.m_team; }

    getName(){ return this.m_name; }

    getNumber(){ return this.m_playerNum; }

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
            if(currTrumpSuit !== "notrump" && currTrumpSuit !== null){
                if(debug){
                    console.log(currTrumpSuit);
                }
                
                for(let i = 0; i<this.m_cards[currTrumpSuit].length; i++){
                    if(this.m_cards[currTrumpSuit][i].rank !== currTrumpRank){
                        //this if to avoid double counting card that is 
                        //trump rank and trump suit
                        adjustedTrumps.push(this.m_cards[currTrumpSuit][i]);
                    }
                    
                }
            }
            if(currTrumpRank !== ""){
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
                });
            }         
    
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
        if(debug){
            console.log(req.body);
        }
        
        res.render('home_page', {
            createGame: false,
            playerIndicesVal: playerIndices
        });
    }
});

app.post('/', function(req, res){
    if(gameID === undefined || gameID === ""){
        //creating a new game
        if(!req.body.numDecks || !req.body.numPlayers || !req.body.kittySize || 
            !req.body.numPlayers.match(/^[0-9]*$/) || 
            !req.body.numDecks.match(/^[0-9]*$/) || 
            !req.body.kittySize.match(/^[0-9]*$/) ){
            res.render('home_page', {message: "Error in an input field", createGame: true});
        }
        else if( (parseInt(req.body.numDecks)*54-parseInt(req.body.kittySize)) % parseInt(req.body.numPlayers) !== 0){
            if(debug){
                console.log("Game id set to " + gameID);  
                console.log("Kitty size error");         
            }
            
            res.render('home_page', {message: "Incorrect kitty size", createGame: true});
        }
        else{
            numDecks = parseInt(req.body.numDecks);
            gameID = req.body.gameID; //unique game identifier
            numPlayers = parseInt(req.body.numPlayers);
            kittySize = parseInt(req.body.kittySize);
            playerIndices = [...Array(numPlayers).keys()]       
            indices = [...Array(54*req.body.numDecks).keys()];
            constants.shuffleArray(indices);
            if(debug){
                console.log(indices.length + " cards randomized!");
                console.log("Game ID: " +gameID);
            }          
            res.redirect("/");
        } 
    }
    else{
        if(debug){
            console.log(req.body);
        }
        
        if(req.body.gameID !== gameID){
            res.render('home_page', {
                message: "Invalid game ID",
                createGame: false,
                playerIndicesVal: playerIndices
            });
        }
        else if(req.body.playerName.match(/,/)){
            res.render('home_page', {
                message: "No commas allowed in name", 
                createGame: false, 
                playerIndicesVal: playerIndices
            });
        }
        else if(req.body.playerNumber === undefined){
            res.render('home_page', {
                message: "Error: Must specify a team and player number",
                createGame: false,
                playerIndicesVal: playerIndices
            });
        }
        else{
            //to do: no duplicate players allowed
            //playerNumber is 0 indexed!
            var newPlayer = new Player(req.body.playerName, parseInt(req.body.playerNumber));
            players[parseInt(req.body.playerNumber)] = newPlayer;
            
            if(parseInt(req.body.playerNumber)%2 == 1){
                newPlayer.setTeam(1);
            }
            else{
                newPlayer.setTeam(2);
            }
            res.redirect('/play/'+gameID+req.body.playerName);
        }
    }
});

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
    console.log("CONNECTION: A user has connected, socket id: " + socket.id);
    
    socket.on('disconnect', function(){
        //to do: diassociate socket id with player to allow for reconnections
        console.log('CONNECTION: user disconnected');
    });
    socket.on('chat message', function(msg){
        if(debug){
            console.log('message sent: ' + "Message: " +msg);
        }
        

        //don't accept messages until player self-identifies
        if(!isSocketAssociated(socket.id)){
            //if we have not connected socket to a player...
            if(debug){
                console.log("Trying to associating socket with player...");
            }
            
            if(!assocSockIDwithName(msg, socket.id))
            {
                socket.emit('chat message', "(Private Msg) ERROR: invalid name or team, try again");
            }
            else{
                socket.emit('chat message', "(Private Msg) SUCCESS: Name set, waiting for other players to join");
                socket.emit('set player details', sockIDtoPlayer[socket.id].getName(), sockIDtoPlayer[socket.id].getNumber(), numPlayers);
                io.emit('add sidebar player', getPlayerNamesAndNumbers());
                if(allPlayersPresent()){                  
                    io.emit('chat message', "STATUS: All players have joined!");
                    setCurrPlayerTurn(players[0].getSocketID());
                    if(debug){
                        console.log("num players: " + numPlayers + "; players.length: " + players.length);
                        console.log("It is player " + currPlayerAllowedToDraw + "'s turn");
                    }
                    io.emit('update sidebar with active', currPlayerAllowedToDraw);
                    io.to(`${players[0].getSocketID()}`).emit('enable draw button', currPlayerAllowedToDraw); //by default, first player is enabled                 
                    io.emit('enable game settings');
                }
            }
        }
        else{
            //default behavior: a chat msg was sent
            io.emit('chat message', "Message: " +msg); //broadcast to everyone
        }
    });
    
    socket.on('sort hand', function(){
        sockIDtoPlayer[socket.id].sortCurrCards()
        socket.emit('serve card array', sockIDtoPlayer[socket.id].flattenCardArrayRetString());
    });

    socket.on('reveal kitty', function(){
        
        for(let i = 0; i< kittyCards.length; i++){
            io.emit('chat message card', kittyCards[i]);
        }
        io.emit('chat message', "KITTY: Revealing kitty cards: ");
    });

    socket.on('draw card', function(sockId){
        //implement turn-based logic here: can't draw until it's your turn
        if(currCard < 54*numDecks-kittySize){
            let index = currCard;
            if(debug){
                console.log(index);
            }           
            // selectedCardStr = constants.allCards[indices[index]%54];
            selectedCardObj = constants.allCardsObj[indices[index]%54];         
            sockIDtoPlayer[sockId].addCardToHand(selectedCardObj);
            // if(debug){
            //     console.log("Dealt card " + selectedCardStr + " to player " + sockId);
            // }
            
            // socket.emit('serve draw card', selectedCardStr);
            socket.emit('serve card array', sockIDtoPlayer[sockId].flattenCardArrayRetString());
            currCard += 1;
            if(!(currCard < 54*numDecks - kittySize)){
                io.emit('disable drawing');
                io.emit('GAME: No more cards to draw');
                gameState = 1;
            }
            else{
                incTurnToNextPlayer();            
                io.to(`${players[currPlayerAllowedToDraw].getSocketID()}`).emit('enable draw button', players[currPlayerAllowedToDraw].getNumber());
                if(debug){
                    console.log(players[currPlayerAllowedToDraw].getSocketID());
                    console.log("Making it player " + currPlayerAllowedToDraw + "'s turn");
                }
                io.emit('update sidebar with active', currPlayerAllowedToDraw);
            }           
        }
        else{
            sockIDtoPlayer[sockId].sortCurrCards();
            socket.emit('serve card array', sockIDtoPlayer[sockId].flattenCardArrayRetString());         
            if(debug){
                console.log("No more cards to draw!");
            }
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
        if(debug){
            console.log(starterChecked + " " + trumpSuit);
        }
        
        if(starterChecked === "starter"){
            currentStarter = sockIDtoPlayer[socket.id];
            currPlayerAllowedToDraw = sockIDtoPlayer[socket.id].getNumber(); //update who's currently allowed to draw
            io.emit('chat message', 'GAME: Player ' + sockIDtoPlayer[socket.id].getName() + " is now the starter");
            io.to(`${socket.id}`).emit('enable draw button', sockIDtoPlayer[socket.id].getNumber());
            socket.broadcast.emit('uncheck starter'); //uncheck everyone else except 

            //override and let starter draw (for starting)
            io.emit('update sidebar with active', currPlayerAllowedToDraw);
        }
        else{
            io.to(`${socket.id}`).emit('uncheck starter');
        }
        if(trumpSuit !== undefined){
            currTrumpSuit = trumpSuit;
            io.emit('chat message', "GAME: The trump suit is now " + trumpSuit);
            io.emit('set trump suit', trumpSuit);
        }
        if(trumpRank !== undefined && trumpRank !== ""){
            currTrumpRank = trumpRank;
            io.emit('chat message', "GAME: The trump rank is now " + trumpRank);
            io.emit('set trump rank', trumpRank);
        }
    });

    socket.on('draw kitty', function(sockId){
        if(currCard >= 54*numDecks-kittySize && currCard<54*numDecks){
            // console.log("Drawing from kitty");
            while(currCard<54*numDecks){
                let index = currCard;
                // console.log(index);
                selectedCardStr = constants.allCards[indices[index]%54];
                selectedCardObj = constants.allCardsObj[indices[index]%54];
                
                sockIDtoPlayer[sockId].addCardToHand(selectedCardObj);
                console.log("KITTY: Dealt kitty card " + selectedCardStr + " to player " + sockId);
                // socket.emit('serve draw card', selectedCardStr);
                socket.emit('serve card array', sockIDtoPlayer[sockId].flattenCardArrayRetString());
                currCard += 1;
            }
            socket.emit('kitty no draw yes set aside', kittySize);
            io.emit('chat message', "KITTY: Player " + sockIDtoPlayer[sockId].getName() + " has drawn the kitty");
        }
    });

    socket.on('set aside kitty', function(setAsideCards){
        if(setAsideCards.length !== kittySize){
            socket.emit('chat message', "(Private Msg) ERROR: Incorrect kitty size");
        }
        else{
            kittyCards = setAsideCards;
            io.emit('chat message', "KITTY: Player " + sockIDtoPlayer[socket.id].getName() + " has set aside the kitty");
            for(let i = 0; i< setAsideCards.length; i++){
                // console.log(setAsideCards[i]);
                sockIDtoPlayer[socket.id].removeCardFromHand(constants.cardStrToObj(setAsideCards[i]));
                // io.emit('chat message', playCardReq[i]);
            }
        }
    });

    socket.on('play card req', function(playCardReq){
        // console.log("Got card play request from " + socket.id);
        io.emit('chat message', constants.sixtyDashes);
        for(let i = 0; i< playCardReq.length; i++){
            // console.log(playCardReq[i]);
            sockIDtoPlayer[socket.id].removeCardFromHand(constants.cardStrToObj(playCardReq[i]));
            // io.emit('chat message', playCardReq[i]);
            io.emit('chat message card', playCardReq[i]);
        }
        io.emit('chat message', "GAME: Player " + sockIDtoPlayer[socket.id].getName() + " played:");
        io.emit('chat message', constants.sixtyDashes);
    });

    socket.on('undo card play', function(playCardReq){
        // console.log("UNDO: Got card undo request from " + socket.id);      
        for(let i = 0; i< playCardReq.length; i++){
            sockIDtoPlayer[socket.id].addCardToHand(constants.cardStrToObj(playCardReq[i]));
            socket.emit('serve card array', sockIDtoPlayer[socket.id].flattenCardArrayRetString());
            io.emit('chat message', playCardReq[i]);
        }
        io.emit('chat message', "UNDO: Player " + sockIDtoPlayer[socket.id].getName() + " undid play with following cards:");
    })
    //emit only to that socket
    socket.emit('chat message', 'GAME: Welcome, please enter your name again.');
});

app.get('*', function(req, res){
    //res = response
    res.redirect('/');
});


http.listen(port, function(){
    console.log('STATUS: Listening on port ' +port);
});

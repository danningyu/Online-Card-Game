$(function () {
    var socket = io();
    var playedCardHistory = []; //stack for "undos"
    var kittySizeClient = -1; //kitty size, transmitted by server
    var thisPlayerNum = -1; //what player number this client is
    var thisPlayerName = "";
    var numPlayers = -1;
    var needToResort = true; //need to re-sort the first time for some reason
    // trasmitted by server
    $('#form1').submit(function(e){
        //for chatting
        e.preventDefault(); // prevents page reloading
        socket.emit('chat message', $('#m').val());
        socket.emit('request card', $('#m').val());
        $('#m').val(''); //this clears the type box
        console.log("Chat submitted");
        return false;
    });

    $('#draw').click(function(e){
        //for drawing cards
        e.preventDefault();
        document.getElementById("draw").disabled = true;
        let thisPlayerSidebarId = "player"+thisPlayerNum;
        console.log(thisPlayerSidebarId);
        document.getElementById(thisPlayerSidebarId).style="color:red" //disable, aka not your turn
        socket.emit('draw card', socket.id);
        console.log(socket.id + " requested to draw a card");
        needToResort = true;
        socket.emit('sort hand');
        
    });

    $('#play').click(function(e){
        //for playing cards
        e.preventDefault();
        if($(".hi2 img.active").length !== 0){
            var cardsToPlay = [];
            const arrayImagesElement = document.getElementById("arrayImages");
            console.log(socket.id + " played card(s): ");
            for(let i = 0; i< $(".hi2 img.active").length; i++){
                console.log($(".hi2 img.active")[i].id);
                cardsToPlay.push($(".hi2 img.active")[i].id);
                
            }
            for(let i = 0; i<cardsToPlay.length; i++){
                console.log("Attempting to remove" + cardsToPlay[i]);
                try{
                    arrayImagesElement.removeChild(document.getElementById(cardsToPlay[i]));
                }
                catch(DOMException){
                    console.log("Remove child failed, using remove");
                    document.getElementById(cardsToPlay[i]).remove();
                }
                
            }
            playedCardHistory.push(cardsToPlay);
            document.getElementById("undo").disabled = false;
            socket.emit('play card req', cardsToPlay);
            needToResort = true;
            socket.emit('sort hand');
        }

    });

    $('#undo').click(function(e){
        //for undoing
        e.preventDefault();
        var lastPlayedCards = playedCardHistory.pop();
        
        if(playedCardHistory.length === 0){
            document.getElementById("undo").disabled = true;
        }
        socket.emit('undo card play', lastPlayedCards);
        needToResort = true;
        socket.emit('sort hand');
    });

    $('#sort').click(function(e){
        e.preventDefault();
        needToResort = true;
        socket.emit('sort hand');
    })

    $('#updateSettings').click(function(e){
        e.preventDefault();
        var isChecked = $('#starterCheckbox:checked').val();
        var trumpSuit = $("input:radio[name='trumpSuit']:checked").val();
        var selTrumpRank = $('#trumpRank').val();
        console.log(selTrumpRank);
        if(isChecked === "starter"){
            document.getElementById("drawKitty").disabled = false;
            document.getElementById("starter").style = "";
            document.getElementById("drawKitty").style = "";
            document.getElementById("setAsideKitty").style = "";
            document.getElementById("revealKitty").style = "";
            document.getElementById("draw").disabled = false;
        }

        socket.emit('set game settings', isChecked, trumpSuit, selTrumpRank);
    });

    $('#drawKitty').click(function(e){
        console.log("Attempting to draw kitty");
        e.preventDefault();
        socket.emit('draw kitty', socket.id);
    });

    $('#setAsideKitty').click(function(e){
        e.preventDefault();
        if($(".hi2 img.active").length !== 0 && $(".hi2 img.active").length === kittySizeClient){
            var cardsToPlay = [];
            const arrayImagesElement = document.getElementById("arrayImages");
            for(let i = 0; i< $(".hi2 img.active").length; i++){
                cardsToPlay.push($(".hi2 img.active")[i].id);
                
            }
            for(let i = 0; i<cardsToPlay.length; i++){
                arrayImagesElement.removeChild(document.getElementById(cardsToPlay[i]));
            }
            playedCardHistory.push(cardsToPlay);
            document.getElementById("undo").disabled = false;
            document.getElementById("revealKitty").disabled = false;
            socket.emit('set aside kitty', cardsToPlay);
        }
    });

    $('#revealKitty').click(function(e){
        e.preventDefault();
        document.getElementById("revealKitty").disabled = true;
        socket.emit('reveal kitty');
    });

    socket.on('set player details', function(sentPlayerName, sentPlayerNum, sentNumPlayers){
        thisPlayerNum = sentPlayerNum;
        thisPlayerName = sentPlayerName;
        numPlayers = sentNumPlayers;
        var playerDetailsStr = " (Your name: " + thisPlayerName  + "; Your player number: " + thisPlayerNum + ")";
        document.getElementById('gamesettings').innerHTML = "Game Settings" + playerDetailsStr;

    });

    socket.on('update sidebar with active', function(activePlayerNum){
        let playerSidebarID = "player" + activePlayerNum;
        let prevPlayerNum = activePlayerNum - 1 >=0 ? activePlayerNum -1 : numPlayers -1;
        console.log(playerSidebarID);

        var childElem = document.getElementById("sidebarhtml").children;
        for(let i = 0; i<childElem.length; i++){
            childElem[i].style="color:red";
        }
        document.getElementById(playerSidebarID).style = "color:green;font-weight:bold";
        
    });

    socket.on('add sidebar player', function(players){
        console.log(players);
        var sidebar = document.getElementById('sidebarhtml');
        
        
        while (sidebar.lastElementChild) {
            sidebar.removeChild(sidebar.lastElementChild);
        }
        var sidebarHeader = document.createElement('h4');
        var sidebarTitle = document.createTextNode('Current Players');
        
        sidebarHeader.appendChild(sidebarTitle);
        sidebar.appendChild(sidebarHeader);
        for(let i = 0; i<players.length; i++){
            if(players[i] !== null){
                let playerNum = players[i].number;
                var divElem = document.createElement('div');
                divElem.id = "player"+playerNum;
                divElem.style = "color:red";
                if(playerNum%2 === 1){
                    var content = document.createTextNode("Player " + playerNum + ": " + players[i].name + " (Team 1)");
                }
                else{
                    var content = document.createTextNode("Player " + playerNum + ": " + players[i].name + " (Team 2)");
                }                                
                divElem.appendChild(content);
                sidebar.appendChild(divElem);
            }
        }
    });

    socket.on('disable drawing', function(){
        document.getElementById(draw).disabled = true;
    });

    socket.on('kitty no draw yes set aside', function(kittySize){
        document.getElementById("drawKitty").disabled = true;
        document.getElementById("setAsideKitty").disabled = false;
        kittySizeClient = kittySize;
    });

    socket.on('uncheck starter', function(){
        $("#starterCheckbox").prop("checked", false);
        document.getElementById("drawKitty").disabled = true;
        document.getElementById("draw").disabled = true;
    });

    socket.on('set trump suit', function(trumpSuit){
        if(trumpSuit !== "" && trumpSuit !== undefined && trumpSuit !== null){
            var radioButton = document.getElementById(trumpSuit+"Trump");
            radioButton.click();
            socket.emit('sort hand');
        }
          
    });

    socket.on('set trump rank', function(inputTrumpRank){
        $('#trumpRank').val(inputTrumpRank);
        socket.emit('sort hand');
    });

    socket.on('chat message', function(msg){
        $('#messages').prepend($('<div>').text(msg));
        if(msg.indexOf("SUCCESS") !== -1){
            //okay if this executes again (idempotent)                        

            document.getElementById("sort").disabled = false; //you can sort anytime
            document.getElementById("play").disabled = false; //you can play anytime
        }
    });

    socket.on('enable game settings', function(){
        document.getElementById("updateSettings").disabled = false;
    });

    socket.on('enable draw button', function(playerNum){
        // thisPlayerNum = playerNum;
        document.getElementById("draw").disabled = false;
        
        // $('#${playerSidebarID}').toggleClass("green black");        
    });

    socket.on('chat message card', function(card){
        $('#messages').prepend(createImageNode(card, card, "chat", 0));
    });

    socket.on('serve card request', function(cardServed){
            console.log("You got a " + cardServed);
            var image = document.getElementById("img1").src = cardServed + ".png";
            console.log("Image source: " + document.getElementById("img1").src);
            document.getElementById( "img1" ).style.display = "inline"; 
    });

    window.addEventListener("resize", function(event){
        console.log(document.body.clientWidth + " wide by " + document.body.clientHeight + ' high');
        socket.emit('sort hand');
    })

    function createImageNode(fileName, altText, location, imageNum) {
        // console.log(fileName);
        const img = new Image();

        img.class = "cardsInHand";
        img.src = fileName+".png";
        img.alt = altText;
        img.style = ""
        if(location === "hand"){
            img.id = fileName;
        }
        else{
            img.id = fileName+"played"
        }
        if(imageNum === 0){
            img.style = "border:2px solid black;width:5%;height:auto";
        }
        else{
            var firstImage = $('#arrayImages img').first()[0];
            var firstImageOffset = $('#arrayImages img').first().offset();
            var allCardParent = document.getElementById("arrayImages");
            var newLeft = (firstImageOffset.left + (firstImage.width/3)*imageNum);
            var firstImgTop = firstImageOffset.top;
            var styleAddition = "border:2px solid black;width:" + firstImage.width + "px;height:auto;position:absolute;top:" + firstImgTop + "px;left:" + newLeft + "px";
            img.style = styleAddition;
        }
        return img;
    }
    
    socket.on('serve draw card', function(card){
        const arrayImagesElement = document.getElementById("arrayImages");
        arrayImagesElement.appendChild(createImageNode(card, card, "hand", 1));
    })

    socket.on('serve card array', function(cards){
        var images = cards;
        // console.log(images);
        const arrayImagesElement = document.getElementById("arrayImages");
        
        while (arrayImagesElement.lastElementChild) {
            arrayImagesElement.removeChild(arrayImagesElement.lastElementChild);
        }
        for(let i = 0; i<cards.length; i++){
            arrayImagesElement.appendChild(createImageNode(images[i], images[i], "hand", i));
        }
        // document.getElementById('sort').click();
        if(needToResort){
            socket.emit('sort hand');
            needToResort = false;
        }                  
        console.log("Resorted cards");
    });

    $('#arrayImages').on('click', 'img', function(){
        $(this).toggleClass("active");
        if($(this)[0].className === 'active'){
            $(this).css("border", "6px solid red");
            var offset = $(this).offset();
            console.log(offset.left + ", " + offset.top);
            console.log($(document).height() + ", " + $(document).width());
        }
        else{
            $(this).css("border", "2px solid black");
            var offset = $(this).offset();
            console.log(offset.left + ", " + offset.top);

        }
        console.log("# of cards selected: " + $(".hi2 img.active").length);
    });
});
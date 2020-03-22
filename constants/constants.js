exports.ranks = new Set(["2", "3", "4","5", "6", "7", "8", "9", "10", "jack", "queen", "king", "ace"]);
exports.suits = new Set(["spades", "hearts", "diamonds", "clubs"]);
exports.ranksSorted = ["2", "3", "4","5", "6", "7", "8", "9", "10", "jack", "queen", "king", "ace"];

exports.ordering = {};

for(let i = 0; i<this.ranksSorted.length; i++){
    this.ordering[this.ranksSorted[i]] = i+2;
}

// console.log(this.ordering);

exports.allCards = [];
exports.allCardsObj = [];
exports.ranks.forEach(rank =>{
    exports.suits.forEach(suit =>{
        exports.allCards.push(rank + "_of_" + suit);
        this.allCardsObj.push(new Object({
            "rank": rank,
            "suit": suit
        }));
    });
});

exports.allCards.push("black_joker");
exports.allCards.push("red_joker");

exports.allCardsObj.push(new Object({
    "rank": "black_joker",
    "suit": "trumps"
}));

exports.allCardsObj.push(new Object({
    "rank": "red_joker",
    "suit": "trumps"
}));

exports.shuffleArray = function(array) {
    for (let i = array.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        let temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}

exports.cardObjToStr = function(cardObj){
    var cardStr = "";
    if(cardObj.suit === "trumps"){
        if(cardObj.rank == "red_joker"){
            cardStr = "red_joker";
        }
        else if(cardObj.rank === "black_joker"){
            cardStr = "black_joker";
        }
    }
    else{
        cardStr = cardObj.rank + "_of_" + cardObj.suit;
    } 
    console.log(cardStr);
    return cardStr;
}

exports.cardStrToObj = function(cardStr){
    var cardObj = undefined;
    if(cardStr === "red_joker")
        cardObj = new Object({
            "rank": "red_joker",
            "suit": "trumps"
        });
    else if(cardStr === "black_joker"){
        cardObj = new Object({
            "rank": "black_joker",
            "suit": "trumps"
        });
    }
    else{
        let firstUS = cardStr.indexOf("_");
        let secondUS = cardStr.indexOf("_", firstUS+1);
        cardObj = new Object({
            "rank": cardStr.substring(0, firstUS),
            "suit": cardStr.substring(secondUS+1, cardStr.length)
        });
    }
    console.log(cardObj);
    return cardObj;
}

// console.log(allCards);
// console.log(allCards.length)

//const https = require('https')
const fetch = require('node-fetch');
const db = require('../db')
const admin = require("firebase-admin");
// const firebase = admin.app();
const matchesRef = db.collection('matches')

function winOrLoss (slot, win) {
  if (slot > 127){
      if (win === false){
          return true
      }
      else return false
  }
  else {
      if (win === false){
          return false
      }
      else return true
  }
}

async function processPlayerInfo(matchStats) {
  let totals = {'kills': 0, 'deaths': 0, 'assists': 0, 'wins':0, 'losses':0}

  let allHeroesGames = {}

  for(let i = 0; i < matchStats.length; i++) {

    //check if hero slot is 0, indicating bad match data
    if(matchStats[i].hero_id === 0 || matchStats[i].hero_id === '0') i++

    //sum all KDA
    totals.kills += matchStats[i].kills
    totals.deaths += matchStats[i].deaths
    totals.assists += matchStats[i].assists

    //sum total wins
    if(winOrLoss(matchStats[i].player_slot, matchStats[i].radiant_win) === true){
      totals.wins += 1
    } else {
      totals.losses += 1
    }

    let heroID = matchStats[i].hero_id

    if(allHeroesGames[heroID] === undefined){
      allHeroesGames[heroID] = {
        games: 0,
        wins: 0,
        losses: 0
      }
    }

    allHeroesGames[heroID].games += 1

    if(winOrLoss(matchStats[i].player_slot, matchStats[i].radiant_win) === true){
      allHeroesGames[heroID].wins += 1
    } else {
      allHeroesGames[heroID].losses += 1
    }
  }

  totals.games =(matchStats.length)
  let avgObj = {'kills': (totals.kills / matchStats.length).toFixed(2), 'deaths': (totals.deaths / matchStats.length).toFixed(2), 'assists': (totals.assists / matchStats.length).toFixed(2)}

  return ({"averages": avgObj, "totals": totals, "allHeroRecord": allHeroesGames})
}

exports.fetchHeroes = async function (req, res) {
  // console.log(req.query)
  let heroesRef = db.collection('heroes')

  heroesRef.get()
  .then(snapshot => {
    if(snapshot.empty){
      console.log('no results in heroes')
      let heroesList = fetch('https://api.opendota.com/api/heroes', {
        method: 'get',
        headers: { 'Content-Type': 'application/json' },
      })
      .then(data => data.json())
      .then((json) => {
        // console.log('search results: ', json[0])
        let storeObj = {
          'herolist': json,
          'lastUpdated': Date.now()
        }

        heroesRef.add(storeObj).then(ref => {
          console.log('Added document with ID: ', ref.id);
        });
        res.send(json)
      });
    } else {
      console.log('[/heroes] Pulling cached heroes')
      snapshot.forEach(doc => {
        console.log('[/heroes] found cached heroes doc', doc.id)
        let returnData = doc.data()
        res.json(returnData['herolist'])
      })
    }
  })
}

exports.searchUser = async function (req, res) {
  // console.log(req.query)
  let userStats = await fetch('https://api.opendota.com/api/search?q=' + req.query.searchString, {
    method: 'get',
    headers: { 'Content-Type': 'application/json' },
  })
  .then(data => data.json())
  .then((json) => {
    // console.log('search results: ', json)
    res.send(json)
  });
}

async function fetchMatchesForUser (userID) {
  console.log('[fmfu] fetching matches for user ', userID)
  return await fetch('https://api.opendota.com/api/players/' + userID + '/matches?significant=0&game_mode=23', {
    method: 'get',
    headers: { 'Content-Type': 'application/json' },
  })
  .then(data => data.json())
  .then((json) => {
    //console.log('matches data complete', json)
    return json
  })
  .catch(e => {
    console.error(e)
  });
}

async function fetchUserData (userID) {
  console.log('[fud] fetching user data for ', userID)
  return await fetch('https://api.opendota.com/api/players/' + userID, {
    method: 'get',
    headers: { 'Content-Type': 'application/json' },
  })
  .then(data => data.json())
  .then((json) => {
    // console.log('user data complete', json)
    return json
  })
  .catch(e => {
    console.error(e)
  });
}

function calculateAdvancedMetrics(matchStats) { 
  let keys = []
  Object.keys(matchStats).forEach(key => {
    keys.push(key)
  })
  // console.log(keys)

  let aggregatedMatchStats = []

  function calculateWardRank(player_slot) {
    // matchStats.players.forEach(player => {
    // })
    return []
  }

  matchStats.players.forEach(player => {  
    aggregatedMatchStats.push({
      player_slot: player.player_slot,
      ward_rank: calculateWardRank(player.player_slot)
    })
  })

  return aggregatedMatchStats
}

async function processMatch (match) {
  let matchID = match.match_id.toString()
  console.log('[processMatch] processing for matchID: ' + matchID)

  //set lastUpdated
  match.lastUpdated = Date.now()

  //calculate advanced stats
  match.calculated = calculateAdvancedMetrics(match)

  //set parsedFlag
  if(match.players[0].damage_targets === null){
    match.isMatchParsed = false
  } else {
    match.isMatchParsed =  true
  }

  return match
}

exports.queryFirebase = async function (req, res) {
  let usersRef = db.collection('users')
  let returnObj = {
    keys: [],
    values: []
  }
  usersRef.where('profile.account_id','==', 65110965).get()
    .then(snapshot => {
      if(snapshot.empty){
        res.send({'nothin': true})
      } else {
        snapshot.forEach(doc => {
          console.log(doc.id)
          returnObj.keys.push(doc.id)
          returnObj.values.push(doc.data())
        })
        res.send(returnObj)
      }
    })
}

exports.getUserStatsfromOD = async function (req, res) {
  let usersRef = db.collection('users')
  let userID = req.params.steamID
  let userStats = {}

  let userExists = await usersRef.where('profile.account_id','==', parseInt(userID)).get()
  .then(snapshot => {
    if(snapshot.empty){
      return false
    } else {
      // console.log('[gusfod] found userID: ' + userID)
      snapshot.forEach(doc => {
        let returnData = doc.data()
        // console.log(doc.id, returnData)
        userStats = returnData
      })
      return true
    }
  })
  
  console.log('[gusfod] user with id ' + userID + ' exists: ' + userExists)
  if(userExists === false) {
    console.log('[gusfod] pulling new user data from OD')
    userStats = await fetchUserData(userID)
    userStats.lastUpdated = Date.now()
    usersRef.doc(userID).set(userStats).then(ref => {
      console.log('[gusfod] Added userID ' + userID);
    });
  }

  let matchStats = await fetchMatchesForUser(req.params.steamID)

  let calcObj =  await processPlayerInfo(matchStats)
  let returnObj = {"userStats": userStats, "matchStats": matchStats, "averages": calcObj.averages, "totals": calcObj.totals, "calculations": calcObj}

  res.send(returnObj)
}

exports.fetchMatchByID = async function (req, res) {
  let matchID = req.params.matchID
  let matchStats = {}

  let matchExists = await matchesRef.where('match_id','==', parseInt(matchID)).get()
  .then(snapshot => {
    if(snapshot.empty){
      return false
    } else {
      // console.log('[fmbi] found matchID: ' + matchID)
      snapshot.forEach(async (doc) => {
        let returnData = doc.data()
        // console.log(doc.id, returnData)

        //process match stats
        let processedMatchStats = await processMatch(returnData)

        //no add to db since already in db
        matchStats = processedMatchStats
      })
      return true
    }
  })
  
  console.log('[fmbi] match with id ' + matchID + ' exists: ' + matchExists)

  if(matchExists === false) {
    console.log('[fmbi] pulling new match data from OD')
    matchStats = await fetch('https://api.opendota.com/api/matches/' + req.params.matchID, {
      method: 'get',
      headers: { 'Content-Type': 'application/json' },
    })
    .then(data => data.json())
    .then(async (json) => {
      // console.log(json)

      //process match stats
      let processedMatchStats = await processMatch(json)
      //console.log(processedMatchStats)
      //console.log("matchid: ", processedMatchStats.match_id)

      //add to DB
      matchesRef.doc(processedMatchStats.match_id.toString()).set(processedMatchStats).then(ref => {
        console.log('[processMatch] Processed and added matchID ' + matchID);
      });
      
      return processedMatchStats
    });
  }

  // calculate ALL the match stats right here bro
  res.send(matchStats)
}

async function updateMatchOnParse (jobID_obj, matchID){
  let jobID = jobID_obj.job.jobId
  let parseComplete = false 
  let count = 0
  console.log('[umop] parse with jobID ' + jobID)

  async function wait(ms) {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }

  while(parseComplete === false){
    await wait(3000)

    let parseDone = await fetch('https://api.opendota.com/api/request/' + jobID, {
      method: 'get',
      headers: { 'Content-Type': 'application/json' },
    })
    .then(data => data.json())
    .then((json) => {
      return json
    });

    if(parseDone === null) parseComplete = true
  }

  console.log('[umop] pulling new match data from OD')
  matchStats = await fetch('https://api.opendota.com/api/matches/' + matchID, {
    method: 'get',
    headers: { 'Content-Type': 'application/json' },
  })
  .then(data => data.json())
  .then((json) => {
    return json
  });

  let processedMatchStats = await processMatch(matchStats)

  //add to DB
  matchesRef.doc(processedMatchStats.match_id.toString()).set(processedMatchStats).then(ref => {
    console.log('[umop] Processed and added matchID ' + matchID);
  });
        
}

exports.parseMatchRequest = async function (req, res) {
  let jobID = await fetch('https://api.opendota.com/api/request/' + req.params.matchID, {
    method: 'post',
    headers: { 'Content-Type': 'application/json' },
  })
  .then(data => data.json())
  .then((json) => {
    // console.log(json)
    return json
  });

  res.send(jobID)
  updateMatchOnParse(jobID, req.params.matchID)
}
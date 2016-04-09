var ncaastats = new function() {
	var ns = this;
	var http = require('http');
	var express = require('express');
	var cheerio = require('cheerio');

	var app = express();
	
	var args = process.argv.slice(2);
	ns.myArgs = {protocol:'http',host:'stats.ncaa.org'};

	for (var a=0;a<args.length;a++){
		var argParts = args[a].split(/[:=]/);
		if (argParts.length === 1){
			ns.myArgs[argParts[0].trim()] = true;
		} else {
			ns.myArgs[argParts[0].trim()] = argParts[1].trim();
		}
	}

	app.get('/games/:teamid/:seasonid', function(req,res){
		res.setHeader('Content-Type', 'application/json');
		var path = '/team/' + req.params.teamid + '/' + req.params.seasonid;
		var options = ns.getOptions({path:path,args:ns.myArgs});
		var teampage = '';
		
		var teamreq = http.get(options, function(teamres){
			if (teamres.statusCode == 200){
				teamres.on('data', function(chunk){
					teampage += chunk;
				});
				teamres.on('end', function(){
					var $ = cheerio.load(teampage);
					var Games = [];
					$('table.mytable td a[href^="/game/index"]').each(function(i,e){
						var url = $(e).attr('href').split('?')[0];
						var gameid = parseInt(url.split('/')[3],10);
						Games.push(gameid);
					});
					var results = {'GameIDs':Games};
					res.end(JSON.stringify(results));
				});
				teamres.on('error', function(e){
					res.end('error: ' + e.message);
				});
			}
		});
	});

	app.get('/game/:gameid', function(req, res){
		res.setHeader('Content-Type', 'application/json');
		var path = '/game/index/' + req.params.gameid;
		var options = ns.getOptions({path:path,args:ns.myArgs});

		var body = '';

		var ncaareq = http.get(options, function(ncaares){
			if (ncaares.statusCode == 200){
				ncaares.on('data', function(chunk){
					body += chunk;
				});
				ncaares.on('end', function(){
					var $ = cheerio.load(body);
					var finalData = ns.GetGameDataAsObject(req.params.gameid, $);
					res.end(finalData);
				});
				ncaares.on('error', function(e){
					res.end('error: ' + e.message);
				});
			} else {
				res.end(JSON.stringify({'error': res.statusCode}));
			}
		});

		ncaareq.on('error', function(e){
			console.log('problem with request: ' + e.message);
			res.end(JSON.stringify(options));
		});
	});

	app.get('/teams/:sport/:division/:year', function(req, res){
		res.setHeader('Content-Type', 'application/json');
		var sport = req.params.sport.toUpperCase();
		var division = req.params.division;
		var year = req.params.year;
		var conference = -1;
		
		var path = '/team/inst_team_list?academic_year=' + year + '&conf_id=' + conference + '&division=' + division + '&sport_code=' + sport;
		var options = ns.getOptions({path:path,args:ns.myArgs});

		var body = '';
		var teams = {'Sport':sport,'Division':parseInt(division,10),'Year':parseInt(year,10)};
		var ncaareq = http.get(options, function(ncaares){
			if (ncaares.statusCode == 200){
				ncaares.on('data', function(chunk){
					body += chunk;
				});
				ncaares.on('end', function(){
					var $ = cheerio.load(body);
					var seasonid = $('td a').first().attr('href').split('/')[3];
					teams.SeasonID = parseInt(seasonid,10);
					teams.Conferences = [];
					$('li a[href*=changeConference]').each(function(i,e){
						var conf = {'ConferenceID':parseInt($(e).attr('href').replace(/^[^0-9]*\(([0-9]+)\.0\);$/,'$1'),10),'ConferenceName':$(e).text(),'Teams':[]};
						if (conf.ConferenceID > 0){
							teams.Conferences.push(conf);
						}
					});
					if (teams.Conferences.length > 0){
						getTeamsFromConferences(teams);
					} else {
						res.end('no team data');
					}
				});
				ncaares.on('error', function(e){
					res.end('error: ' + e.message);
				});
			} else {
				res.end(JSON.stringify({'error': res.statusCode}));
			}
		});
		
		function getTeamsFromConferences(teams){
			var confData = [];
			for (var c=0;c<teams.Conferences.length;c++){
				var confpath = '/team/inst_team_list?academic_year=' + year + '&conf_id=' + teams.Conferences[c].ConferenceID + '&division=' + division + '&sport_code=' + sport;
				confData.push({
					sequence:c,
					options: ns.getOptions({path:confpath,args:ns.myArgs})
				});					
			}
			getTeamsFromConference(teams, confData.shift(), confData);
		};
		
		function getTeamsFromConference(teams, conf, remaining){			
			var confpage;
			var confreq = http.get(conf.options, function(confres){
				if (confres.statusCode == 200){
					confres.on('data', function(chunk){
						confpage += chunk;
					});
					confres.on('end', function(){
						var $ = cheerio.load(confpage);
						$('td a').each(function(i,e){
							var teamLinkPieces = $(e).attr('href').split('/');
							var teamid = teamLinkPieces[2];
							var team = {'TeamID':parseInt(teamid,10),TeamName:$(e).text().trim()};
							teams.Conferences[conf.sequence].Teams.push(team);
						});
						if (remaining.length > 0){
							getTeamsFromConference(teams, remaining.shift(), remaining);
						} else {
							res.end(JSON.stringify(teams));
						}
					});
					confres.on('error', function(e){
						res.end('error: ' + e.message);
					});
				}
			});
		}
		/*
		function getGamesFromTeams(teams){
			var teamData = [];
			for (var c=0;c<teams.Conferences.length;c++){
				for (var t=0;t<teams.Conferences[c].Teams.length;t++){
					var teampath = '/team/' + teams.Conferences[c].Teams[t].TeamID + '/' + teams.YearID;
					teamData.push({
						confsequence:c,
						sequence:t,
						options: ns.getOptions({path:teampath,args:ns.myArgs})
					});
				}
			}
			getGamesFromTeam(teams, teamData.shift(), teamData);
		}
		
		function getGamesFromTeam(teams, team, remaining){
			var teampage;
			var teamreq = http.get(team.options, function(teamres){
				if (teamres.statusCode == 200){
					teamres.on('data', function(chunk){
						teampage += chunk;
					});
					teamres.on('end', function(){
						var $ = cheerio.load(teampage);
						teams.Conferences[team.confsequence].Teams[team.sequence].Games = [];
						$('table.mytable td a[href^="/game/index"]').each(function(i,e){
							var gameid = $(e).attr('href').split(/[?/]/)[3];
							var game = {'GameID':gameid};
							teams.Conferences[team.confsequence].Teams[team.sequence].Games.push(game);
						});
						if (remaining.length > 0){
							getGamesFromTeam(teams, remaining.shift(), remaining);
						} else {							
							res.end(JSON.stringify(teams));
						}
					});
					teamres.on('error', function(e){
						res.end('error: ' + e.message);
					});
				}
			});
		}
		*/
		ncaareq.on('error', function(e){
			console.log('problem with request: ' + e.message);
			res.end(JSON.stringify(options));
		});
	});
	
	ns.getOptions = function(params){
		var fullhost = params.args.protocol + '://' + params.args.host;
		if (params.args.proxy !== undefined){
			return {
				host: params.args.proxyname,
				port: 8080,
				path: fullhost + params.path,
				headers: {
					'Proxy-Authorization': 'Basic ' + new Buffer(params.args.proxyuser + ':' + params.args.proxypass).toString('base64'),
					'Host': params.args.host
				}
			};
		} else {
			return {
				host: params.args.host,
				path: params.path
			};
		}
	};
	
	ns.GetGameDataAsObject = function(gameid, $){
		var statTables = $('table.mytable:has(tr.heading)');
		var teams = ['Away','Home'];
		var tagTable = $('table.mytable').first().next('table');
		var detailsTable = tagTable.next('table');
		var officialsTable = detailsTable.next('table');
		var details = Object.assign.apply({},detailsTable.find('tr').map(function(){
			var det = {};
			det[$(this).find('td').first().text().replace(':','')]=$(this).find('td').eq(1).text();
			return det;
		}));
		details.GameTag = tagTable.find('td:nth-child(1)').map(function(){
			return $(this).text();
		}).get().join();
		details.Officials = officialsTable.find('tr').first().find('td').eq(1).text().trim().split(/,[ ]?/);
		var teamData = {GameID:parseInt(gameid,10),SeasonID:null,Details:details};
		var statNames = [];
		var teamLinks = $('table.mytable:not(:has(tr.heading)) tr').slice(1);
		teamLinks.each(function(i,e){
			var teamLink = $(e).find('a');
			if (teamLink.length > 0){
				var ids = teamLink.attr('href').split('/');
				teamData['SeasonID'] = parseInt(ids[3],10);
				teamData[teams[i]] = {'TeamID':parseInt(ids[2],10),'TeamName':teamLink.text().trim(),'Stats':[]};
			} else {
				teamData[teams[i]] = {'TeamID':null,'TeamName':$(e).find('td').first().text().trim(),'Stats':[]};
			}
		});

		statTables.each(function(i,e){
			var table = $(e);
			table.find('th').each(function(h,stat){
				if (h > 0){
					statNames.push($(stat).text().trim());
				}
			});
			var statRows = table.find('tr:not(.heading)');
			statRows.each(function(n,row){
				if (n > 0 && n < statRows.length - 1) {
					var playerTD = $(row).find('td').first();
					var playerLink = playerTD.find('a').attr('href');
					playerLink = (playerLink == undefined ? '' : playerLink);
					var playerData = {'PlayerID':parseInt(playerLink.replace(/^.*[=](.*)$/,'$1'),10),'PlayerName':playerTD.text().trim()};

					$(row).find('td').each(function(j,val){
						if (j > 0 && statNames[j-1].toUpperCase() != 'POS'){
							var stat = parseInt($(val).text().trim().replace('/','').replace(':00',''), 10);
							playerData[statNames[j-1]] = (isNaN(stat) ? 0 : stat);
						}
					});
					teamData[teams[i]].Stats.push(playerData);
				}
			});
		});

		return JSON.stringify(teamData);
	};

	var server = app.listen(8088, function(){
		console.log('Passing game data through stats.ncaa.org from http://%s:%s', server.address().address, server.address().port);
	});
	
	server.timeout = 600000;
};

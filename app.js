const {ipcRenderer, remote} = require('electron');
const fs = require('fs');
const http = require('http');
const md5 = require("crypto-js/md5");
const Q = require('q');
const jsmediatags = require('jsmediatags');
const {globalShortcut} = remote;
const subyFolder = process.env.HOME + '/Music/Suby/';
let apiBaseU = '';
let apiAccessToken = '';
let currentFolder = subyFolder;


/**
 * the player
 */
$(document).ready(function ($) {

    loadSettings();
    updateDirListing();

    $(document).on('click', '.folder-name', function () {
        if ($(this).data('artist')) {
            updateDirListing($(this).data('artist'), false);
            $('.album-list').text('');
            $('.track-list').text('');
        } else if ($(this).data('album')) {
            updateDirListing(false, $(this).data('album'));
        } else {
            currentFolder += $(this).text() + '/';
            updateDirListing();
        }
    });

    $(document).on('click', '.file-name', function () {
        playFile(currentFolder + $(this).text());
        $('.play-list').text('');
        $('.play-list').append('<li class="play-list-item currently-playing">' + file.name + '</li>');
    });

    $(document).on('click', '.file-stream', function () {
        playStream($(this));
    });

    $('#the-player').on('ended', function () {
        let nextsong = $('.play-list .currently-playing').next();
        if (nextsong) {
            playStream(nextsong);
        }
    });
    $(document).on('click', '.js-show-settings', function () {
        $('.settings-container').toggle();
    });

    $(document).on('click', '#settings-save', function (e) {
        e.preventDefault();
        let settings = localStorage.getItem('suby-settings');
        if (settings) {
            settings = JSON.parse(settings);
        } else {
            settings = {};
        }
        settings.server = $('#settings-server').val();
        settings.username = $('#settings-username').val();
        settings.password = $('#settings-password').val();
        localStorage.setItem('suby-settings', JSON.stringify(settings));
        popUpNotification('success', 'Settings saved!');
        return false;
    });


    /**
     * Online Offline eventlistener
     */

    /*window.addEventListener('online', updateDirListing());
    window.addEventListener('offline', updateDirListing());*/


    function playFile(file) {
        $('#now-playing').text('');
        $('#the-player').attr('src', file);
        $('#the-player')[0].play();
        jsmediatags.read(file, {
            onSuccess: function (tag) {
                $('#now-playing').append(tag.tags.artist + ' - ' + tag.tags.album + ' - ' + tag.tags.title);
            },
            onError: function (error) {
                console.log(':(', error.type, error.info);
            }
        });
    }

    function playStream(item) {
        let self = item;
        let url = apiBaseU + 'stream' + apiAccessToken + '&id=' + self.data('song');
        let filepath = subyFolder + self.data('path');

        let lastIndex = filepath.lastIndexOf('/');
        let path = filepath.substr(0, lastIndex);

        if (fs.existsSync(pathReplace(filepath))) {
            playFile(pathReplace(filepath))
        } else {
            fs.mkdir(path, {recursive: true}, (err) => {
                if (err) throw err;
            });

            $('#now-playing').text('streaming');
            $('#the-player').attr('src', url);
            $('#the-player')[0].play();
            download(url, pathReplace(filepath));
        }
        let playlist = self.nextAll();
        $('.play-list').text('');
        $('.play-list').append('<li class="play-list-item currently-playing">' + self.text() + '</li>');
        $.each(playlist, function () {
            $('.play-list').append('<li class="play-list-item" data-song="' + $(this).data('song') + '" data-path="' + $(this).data('path') + '">' + $(this).text() + '</li>');
        });
    }

    function updateDirListing(artistid, albumid) {
        if (navigator.onLine) {
            if (artistid) {
                getAlbums(artistid);
            } else if (albumid) {
                getTracks(albumid);
            } else {
                getArtists();
            }
        } else {
            fs.readdir(currentFolder, {withFileTypes: true}, (err, files) => {
                if (err) {
                    console.log(err)
                } else {
                    $('.artist-list').text('');
                    files.forEach(file => {
                        if (file.isDirectory()) {
                            $('.artist-list').append('<li class="folder-name">' + file.name + '</li>');
                        } else {
                            if (file.name.endsWith('.mp3') || file.name.endsWith('.m4a')) {
                                $('.artist-list').append('<li class="file-name">' + file.name + '</li>');
                            }
                        }
                    });
                }
            });
        }
    }

    /**
     * The keyboard shortcuts
     */
    globalShortcut.register('CommandOrControl+O', () => {
        console.log("Event sent.");
    });

    /**
     * API Stuff
     */
    function getArtists() {
        let api = apiBaseU + 'getArtists' + apiAccessToken;
        $.get(api, function (data) {
            let artists = data["subsonic-response"]["artists"]["index"];
            artists.forEach(file => {
                file.artist.forEach(artist => {
                    $('.artist-list').append('<li class="folder-name" data-artist="' + artist.id + '">' + artist.name + '</li>');
                });
            });
        });
    }

    function getAlbums(artistid) {
        let api = apiBaseU + 'getArtist' + apiAccessToken + '&id=' + artistid;
        $.get(api, function (data) {
            let albums = data["subsonic-response"]["artist"]["album"];
            $('.album-list').text('');
            albums.forEach(album => {
                $('.album-list').append('<li class="folder-name" data-album="' + album.id + '">' + album.name + '</li>');
            });
        });
    }

    function getTracks(albumid) {
        let api = apiBaseU + 'getAlbum' + apiAccessToken + '&id=' + albumid;
        $.get(api, function (data) {
            let tracks = data["subsonic-response"]["album"]["song"];
            $('.track-list').text('');
            tracks.forEach(song => {
                $('.track-list').append('<li class="file-stream" data-song="' + song.id + '" data-path="' + song.path + '">' + song.title + '</li>');
            });
        });
    }

    function download(url, filepath) {
        var fileStream = fs.createWriteStream(filepath),
            deferred = Q.defer();

        fileStream.on('open', function () {
            http.get(url, function (res) {
                res.on('error', function (err) {
                    deferred.reject(err);
                });

                res.pipe(fileStream);
            });
        }).on('error', function (err) {
            deferred.reject(err);
        }).on('finish', function () {
            deferred.resolve(filepath);
        });

        return deferred.promise;
    }

    $(document).on('ended', $('#the-player')[0], function (e) {
        playFile();
    });

    function pathReplace(path) {
        let find = ':';
        let re = new RegExp(find, 'g');

        path = path.replace(re, '_');
        find = "'";
        re = new RegExp(find, 'g');

        path = path.replace(re, '_');
        return path;
    }

    function popUpNotification(level, message) {
        console.log(level + ': ' + message);
    }

    function loadSettings() {
        let settings = localStorage.getItem('suby-settings');
        if (settings) {
            settings = JSON.parse(settings);
        } else {
            settings = {};
        }
        $('#settings-server').val(settings.server);
        $('#settings-username').val(settings.username);
        $('#settings-password').val(settings.password);
        apiBaseU = settings.server + "/rest/";
        let token = md5(settings.password + 'therandomsalt');
        apiAccessToken = '?u=' + settings.username + '&t=' + token + '&s=therandomsalt&v=1.16.1&c=thesuby&f=json';
    }
});
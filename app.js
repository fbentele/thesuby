const {ipcRenderer, remote} = require('electron');
const fs = require('fs');
const http = require('http');
const https = require('https');
const md5 = require("crypto-js/md5");
const Q = require('q');
const jsmediatags = require('jsmediatags');
const {globalShortcut} = remote;
const subyFolder = process.env.HOME + '/Music/Suby/';
let apiBaseUrl = '';
let apiAccessToken = '';
let currentFolder = subyFolder;

$(document).ready(function ($) {
    let artistList = $('.artist-list-select');
    let albumList = $('.album-list-select');
    let trackList = $('.track-list-select');
    let playList = $('.play-list');
    let player = $('#the-player');
    let nowPlaying = $('#now-playing');
    let notification = $('#notification-center');

    loadSettings();
    updateDirListing();


    $(document).on('dblclick', '.album-list .folder-name', function () {
        let self = $('.file-stream').first();
        playStream(self);
        populatePlaylist(self);
    });

    albumList.change(function () {
        updateDirListing(false, $(this).val());
    });

    var last_valid_selection = null;
    artistList.change(function (e) {
        if ($(this).val().length > 1) {
            $(this).val(last_valid_selection);
        } else {
            last_valid_selection = $(this).val();
        }
        albumList.empty();
        trackList.empty();
        updateDirListing($(this).val(), false);

    });

    $(document).on('dblclick', '.file-stream', function () {
        let self = $(this);
        playStream(self);
        populatePlaylist(self);
        saveActiveState('song', $(this).data('song'));
    });

    $(document).on('dblclick', '.play-list-item', function () {
        let self = $(this);
        playStream(self);
        updatePlaylistCurrentlyPlaying(self);
    });

    $(document).on('click', '.js-page', function () {
        let self = $(this);
        $('.js-page.active').removeClass('active');
        self.addClass('active');
        let target = $('.' + self.data('page'));
        $('.page-item').hide();
        target.show();
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

    $(document).on('click', '.js-play-next', playNextSong);

    $(document).on('click', '.js-play-previous', playPreviousSong);

    player.on('ended', playNextSong);

    /**
     * Online Offline eventlistener
     */

    /*window.addEventListener('online', updateDirListing());
    window.addEventListener('offline', updateDirListing());*/

    function playNextSong() {
        let self = $('.play-list .currently-playing');
        let nextSong = self.next();
        if (nextSong.length) {
            updatePlaylistCurrentlyPlaying(nextSong);
            playStream(nextSong);
        }
    }

    function playPreviousSong() {
        let self = $('.play-list .currently-playing');
        let prevSong = self.prev();
        if (prevSong.length) {
            updatePlaylistCurrentlyPlaying(prevSong);
            playStream(prevSong);
        }
    }

    function updatePlaylistCurrentlyPlaying(self) {
        $('.play-list .currently-playing').removeClass('active');
        $('.play-list .currently-playing').removeClass('currently-playing');
        self.addClass('currently-playing');
        self.addClass('active');
    }

    function populatePlaylist(self) {
        let playlist = self.nextAll();
        playList.html('<thead><tr><th>Playlist</th></tr></thead>');
        playList.append('<tr class="play-list-item currently-playing active" data-song="' + self.data('song') + '" data-path="' + self.data('path') + '"><td>' + self.text() + '</td></tr>');
        $.each(playlist, function () {
            playList.append('<tr class="play-list-item" data-song="' + $(this).data('song') + '" data-path="' + $(this).data('path') + '"><td>' + $(this).text() + '</td></tr>');
        });
        $('#custom-controls').show();
    }

    function updateSongInfo(file) {
        jsmediatags.read(file, {
            onSuccess: function (tag) {
                nowPlaying.text(tag.tags.artist + ' - ' + tag.tags.album + ' - ' + tag.tags.title);
            },
            onError: function (error) {
                console.log(':(', error.type, error.info);
            }
        });
    }

    function playFile(file) {
        player.attr('src', file);
        player[0].play();
        updateSongInfo(file);
    }

    function playStream(item) {

        let self = item;
        let url = apiBaseUrl + 'stream' + apiAccessToken + '&id=' + self.data('song');
        let filepath = subyFolder + self.data('path');

        let lastIndex = filepath.lastIndexOf('/');
        let path = filepath.substr(0, lastIndex);

        filepath = pathReplace(filepath);
        let filesize = false;
        if (fs.existsSync(filepath)) {
            let filestats = fs.statSync(filepath);
            filesize = filestats["size"];
        }

        if (filesize) {
            logger('debug', 'play local file');
            playFile(filepath)
        } else {
            fs.mkdir(path, {recursive: true}, (err) => {
                if (err) throw err;
            });

            nowPlaying.text('Streaming...');
            player.attr('src', url);
            player[0].play();
            download(url, filepath);
        }
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
                    $('.artist-list').append('<label>Artists</label>');
                    files.forEach(file => {
                        if (file.isDirectory()) {
                            $('.artist-list').append('<option class="folder-name"><div>' + file.name + '</div></option>');
                        } else {
                            if (file.name.endsWith('.mp3') || file.name.endsWith('.m4a')) {
                                $('.artist-list').append('<option class="file-name"><div>' + file.name + '</div></option>');
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
    /*globalShortcut.register('asdfasdf', () => {
    });*/

    /**
     * Custom Keyboard shortcuts
     */
    $(document).keyup(function (e) {
        if (e.keyCode == 32 && $('input:focus').length === 0) { // space
            if (player[0].paused) {
                player[0].play();
            } else {
                player[0].pause();
            }
        }
        if (e.keyCode == 13) { // enter
            if (artistList.is(':focus')) {
                $('.album-list .folder-name').first().trigger('click');
                albumList.focus();
            } else if (albumList.is(':focus')) {
                $('.track-list .file-stream').first().trigger('click');
                trackList.focus();
            } else if (trackList.is(':focus')) {
                let self = $('.file-stream:selected');
                playStream(self);
                populatePlaylist(self);
            }

            e.preventDefault();
            return false;
        }

    });

    /**
     * API Stuff
     */
    function getArtists() {
        let api = apiBaseUrl + 'getArtists' + apiAccessToken;
        $.get(api, function (data) {
            let artists = data["subsonic-response"]["artists"]["index"];
            artistList.empty();
            artists.forEach(file => {
                file.artist.forEach(artist => {
                    artistList.append('<option class="folder-name" data-artist="' + artist.id + '" value="' + artist.id + '"><td>' + artist.name + '</td></option>');
                });
            });
            artistList.focus();
        }).fail(function (e) {
            fs.readdir(currentFolder, {withFileTypes: true}, (err, files) => {
                if (err) {
                    console.log(err)
                } else {
                    artistList.empty();
                    files.forEach(file => {
                        if (file.isDirectory()) {
                            artistList.append('<option class="folder-name" value="' + file.name + '"><td>' + file.name + '</td></option>');
                        }
                    });
                }
            });

        });
    }

    function getAlbums(artistid) {
        if (isNaN(artistid)) {
            fs.readdir(currentFolder + artistid, {withFileTypes: true}, (err, files) => {
                if (err) {
                    console.log(err)
                } else {
                    albumList.empty();
                    files.forEach(file => {
                        if (file.isDirectory()) {
                            albumList.append('<option class="folder-name" value="' + artistid + '/' + file.name + '"><td>' + file.name + '</td></option>');
                        }
                    });
                }
            });
        } else {
            let api = apiBaseUrl + 'getArtist' + apiAccessToken + '&id=' + artistid;
            $.get(api, function (data) {
                let albums = data["subsonic-response"]["artist"]["album"];
                albumList.empty();
                albums.forEach(album => {
                    albumList.append('<option class="folder-name" data-album="' + album.id + '" value="' + album.id + '"><div>' + album.name + '</div></option>');
                });
            });
        }

    }

    function getTracks(albumid) {
        if (isNaN(albumid)) {
            fs.readdir(currentFolder + albumid, {withFileTypes: true}, (err, files) => {
                if (err) {
                    console.log(err)
                } else {
                    trackList.empty();
                    files.forEach(file => {
                        if (!file.isDirectory()) {
                            trackList.append('<option class="file-stream" value="' + file.name + '" data-path="' + albumid + '/' + file.name + '"><td>' + file.name + '</td></option>');
                        }
                    });
                }
            });
        } else {
            let api = apiBaseUrl + 'getAlbum' + apiAccessToken + '&id=' + albumid;
            trackList.empty();
            $.get(api, function (data) {
                let tracks = data["subsonic-response"]["album"]["song"];
                tracks.forEach(song => {
                    trackList.append('<option class="file-stream" data-song="' + song.id + '" value="' + song.id + '" data-path="' + song.path + '"><div>' + song.title + '</div></option>');
                });
            });
        }
    }

    function download(url, filepath) {
        var fileStream = fs.createWriteStream(filepath),
            deferred = Q.defer();

        fileStream.on('open', function () {
            if (url.startsWith('https')) {
                https.get(url, function (res) {
                    res.on('error', function (err) {
                        deferred.reject(err);
                    });

                    res.pipe(fileStream);
                });
            } else {
                http.get(url, function (res) {
                    res.on('error', function (err) {
                        deferred.reject(err);
                    });

                    res.pipe(fileStream);
                });
            }

        }).on('error', function (err) {
            deferred.reject(err);
        }).on('finish', function () {
            deferred.resolve(filepath);
            updateSongInfo(filepath);
        });

        return deferred.promise;
    }

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
        notification.append('<div class="' + level + '">' + message + '</div>');
        setTimeout(function () {
            notification.text('');
        }, 2500);
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
        apiBaseUrl = settings.server + "/rest/";
        let token = md5(settings.password + 'therandomsalt');
        apiAccessToken = '?u=' + settings.username + '&t=' + token + '&s=therandomsalt&v=1.16.1&c=thesuby&f=json';
    }

    function saveActiveState(key, value) {
        let activeStates = localStorage.getItem('suby-active-states');
        if (activeStates) {
            activeStates = JSON.parse(activeStates);
        } else {
            activeStates = {};
        }
        activeStates[key] = value;
        localStorage.setItem('suby-active-states', JSON.stringify(activeStates));
    }

    function loadActiveStates(key) {
        let activeStates = localStorage.getItem('suby-active-states');
        if (activeStates) {
            activeStates = JSON.parse(activeStates);
        } else {
            activeStates = {};
        }

        // set active state for artist
        switch (key) {
            case 'artist':
                $('.artist-name[data-artist="' + activeStates.artist + '"]').trigger('click');
                break;
            case 'album':
                $('.album-name[data-album="' + activeStates.album + '"]').trigger('click');
                break;
            case 'song':
                $('.file-stream[data-song="' + activeStates.song + '"]').trigger('click');
                break;
        }
    }

    function logger(level, msg) {
        var levels = {
            error: "ERROR",
            warn: "WARN",
            info: "INFO",
            debug: "DEBUG"

        };
        console.log(levels[level] + ': ' + msg);
    }
});
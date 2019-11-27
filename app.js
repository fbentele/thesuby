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

$(document).ready(function ($) {
    let albumList = $('.album-list');
    let trackList = $('.track-list');
    let playList = $('.play-list');
    let player = $('#the-player');
    let nowPlaying = $('#now-playing');
    let notification = $('#notification-center');

    loadSettings();
    updateDirListing();

    $(document).on('click', '.folder-name', function () {
        if ($(this).data('artist')) {
            updateDirListing($(this).data('artist'), false);
            albumList.html('<thead><tr><th>Album</th></tr></thead>');
            trackList.html('<thead><tr><th>Tracks</th></tr></thead>');
        } else if ($(this).data('album')) {
            updateDirListing(false, $(this).data('album'));
        } else {
            currentFolder += $(this).text() + '/';
            updateDirListing();
        }
        $(this).siblings().removeClass('active');
        $(this).addClass('active');
    });

    $(document).on('dblclick', '.album-list .folder-name', function () {
        let self = $('.file-stream').first();
        playStream(self);
        populatePlaylist(self);
    });

    $(document).on('dblclick', '.file-stream', function () {
        let self = $(this);
        playStream(self);
        populatePlaylist(self);
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
        $('.play-list .currently-playing').removeClass('currently-playing');
        self.addClass('currently-playing');
    }

    function populatePlaylist(self) {
        let playlist = self.nextAll();
        playList.html('<thead><tr><th>Playlist</th></tr></thead>');
        playList.append('<tr class="play-list-item currently-playing" data-song="' + $(this).data('song') + '" data-path="' + $(this).data('path') + '"><td>' + self.text() + '</td></tr>');
        $.each(playlist, function () {
            playList.append('<tr class="play-list-item" data-song="' + $(this).data('song') + '" data-path="' + $(this).data('path') + '"><td>' + $(this).text() + '</td></tr>');
        });
        $('#custom-controls').show();
    }

    function updateTrackInfo(file) {
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
        updateTrackInfo(file);
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

            nowPlaying.text('Streaming...');
            player.attr('src', url);
            player[0].play();
            download(url, pathReplace(filepath));
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
                    $('.artist-list').append('<thead><tr><th>Artists</th></tr></thead>');
                    files.forEach(file => {
                        if (file.isDirectory()) {
                            $('.artist-list').append('<tr class="folder-name"><td>' + file.name + '</td></tr>');
                        } else {
                            if (file.name.endsWith('.mp3') || file.name.endsWith('.m4a')) {
                                $('.artist-list').append('<tr class="file-name"><td>' + file.name + '</td></tr>');
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
            $('.artist-list').append('<thead><tr><th>Artists</th></tr></thead>');
            artists.forEach(file => {
                file.artist.forEach(artist => {
                    $('.artist-list').append('<tr class="folder-name" data-artist="' + artist.id + '"><td>' + artist.name + '</td></tr>');
                });
            });
        });
    }

    function getAlbums(artistid) {
        let api = apiBaseU + 'getArtist' + apiAccessToken + '&id=' + artistid;
        $.get(api, function (data) {
            let albums = data["subsonic-response"]["artist"]["album"];
            albumList.html('<thead><tr><th>Album</th></tr></thead>');
            albums.forEach(album => {
                albumList.append('<tr class="folder-name" data-album="' + album.id + '"><td>' + album.name + '</td></tr>');
            });
        });
    }

    function getTracks(albumid) {
        let api = apiBaseU + 'getAlbum' + apiAccessToken + '&id=' + albumid;
        $.get(api, function (data) {
            let tracks = data["subsonic-response"]["album"]["song"];
            trackList.html('<thead><tr><th>Tracks</th></tr></thead>');
            tracks.forEach(song => {
                trackList.append('<tr class="file-stream" data-song="' + song.id + '" data-path="' + song.path + '"><td>' + song.title + '</td></tr>');
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
            updateTrackInfo(filepath);
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
        apiBaseU = settings.server + "/rest/";
        let token = md5(settings.password + 'therandomsalt');
        apiAccessToken = '?u=' + settings.username + '&t=' + token + '&s=therandomsalt&v=1.16.1&c=thesuby&f=json';
    }
})
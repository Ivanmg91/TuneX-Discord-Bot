'use strict';

const admin = require('firebase-admin');
const path = require('path');

let db;
let storage;
let initialized = false;

/**
 * Initialise Firebase Admin SDK.
 * Credentials can be provided either as a file path or as a base64-encoded
 * JSON string (FIREBASE_SERVICE_ACCOUNT_B64) – useful for environments where
 * mounting a file is not practical (e.g. CI/CD or cloud hosting).
 */
function initFirebase() {
  if (initialized) return;

  let serviceAccount;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
    const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8');
    serviceAccount = JSON.parse(json);
  } else {
    const keyPath = path.resolve(
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './serviceAccountKey.json'
    );
    serviceAccount = require(keyPath);
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });

  db = admin.firestore();
  storage = admin.storage();
  initialized = true;
  console.log('[Firebase] Connected successfully.');
}

/**
 * Search songs in Firestore.
 *
 * The bot supports two strategies:
 *  1. Prefix search on `titleLower` (fast, no extra index needed).
 *  2. Prefix search on `artistLower` as fallback.
 *
 * Expected Firestore document structure:
 * {
 *   title:        "Song Name",
 *   titleLower:   "song name",      // lowercase copy – needed for search
 *   artist:       "Artist Name",
 *   artistLower:  "artist name",    // lowercase copy – needed for search
 *   album:        "Album",          // optional
 *   duration:     "3:45",           // optional, human-readable string
 *   audioUrl:     "https://…",      // direct public/signed URL   – OR –
 *   storagePath:  "songs/file.mp3", // Firebase Storage path
 *   coverUrl:     "https://…",      // optional cover art
 *   genre:        "Rock",           // optional
 * }
 *
 * @param {string} query
 * @returns {Promise<Array<Object>>}
 */
async function searchSongs(query) {
  const q = query.toLowerCase().trim();
  const collection = process.env.FIREBASE_SONGS_COLLECTION || 'songs';
  const songsRef = db.collection(collection);

  // 1. Prefix search on titleLower
  // '\uf8ff' is a very high Unicode character that serves as an upper-bound
  // for Firestore prefix queries — any string starting with `q` will be ≤ `q\uf8ff`.
  const titleSnap = await songsRef
    .where('titleLower', '>=', q)
    .where('titleLower', '<=', q + '\uf8ff')
    .limit(10)
    .get();

  if (!titleSnap.empty) {
    return titleSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  // 2. Fallback: prefix search on artistLower
  const artistSnap = await songsRef
    .where('artistLower', '>=', q)
    .where('artistLower', '<=', q + '\uf8ff')
    .limit(10)
    .get();

  return artistSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/**
 * Resolve a playable audio URL for a song document.
 * Prefers a stored `audioUrl` / `url` field; falls back to generating a
 * short-lived signed URL from Firebase Storage when only a `storagePath` is
 * present.
 *
 * @param {Object} song  Firestore document data
 * @returns {Promise<string>}
 */
async function getSongUrl(song) {
  if (song.audioUrl) return song.audioUrl;
  if (song.url) return song.url;
  if (song.downloadUrl) return song.downloadUrl;

  if (song.storagePath || song.storageRef) {
    const bucket = storage.bucket();
    const file = bucket.file(song.storagePath || song.storageRef);
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });
    return url;
  }

  throw new Error('No audio URL found for this song.');
}

module.exports = { initFirebase, searchSongs, getSongUrl };

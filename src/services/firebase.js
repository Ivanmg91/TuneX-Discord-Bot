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
 * Supports two strategies:
 *  1. Prefix search on `title` (case-insensitive by lowercasing the query).
 *  2. Prefix search on `artistName` as fallback.
 *
 * Firestore document structure (TuneX app):
 * {
 *   id:          "1770324973876",
 *   title:       "mamamovilalcielo",
 *   artistName:  "chakal",
 *   artistId:    "…",
 *   artistEmail: "…",
 *   audioUrl:    "https://firebasestorage.googleapis.com/…",
 *   imageUrl:    "https://firebasestorage.googleapis.com/…",
 *   likes:       0,
 *   likedBy:     [],
 *   lyrics:      "",
 *   presetUrl:   "",
 *   uploadedAt:  Timestamp,
 * }
 *
 * @param {string} query
 * @returns {Promise<Array<Object>>}
 */
async function searchSongs(query) {
  const q = query.toLowerCase().trim();
  const collection = process.env.FIREBASE_SONGS_COLLECTION || 'songs';
  const songsRef = db.collection(collection);

  // 1. Prefix search on `title`.
  // '\uf8ff' is a very high Unicode character that acts as an upper-bound
  // for Firestore prefix queries — any string starting with `q` will be ≤ `q\uf8ff`.
  // NOTE: Firestore range queries are case-sensitive. TuneX stores titles in
  // lowercase (e.g. "mamamovilalcielo"), and we lowercase the query here, so
  // searches match as long as titles are saved in lowercase in Firestore.
  const titleSnap = await songsRef
    .where('title', '>=', q)
    .where('title', '<=', q + '\uf8ff')
    .limit(10)
    .get();

  if (!titleSnap.empty) {
    return titleSnap.docs.map((doc) => normalizeSong(doc));
  }

  // 2. Fallback: prefix search on `artistName`
  const artistSnap = await songsRef
    .where('artistName', '>=', q)
    .where('artistName', '<=', q + '\uf8ff')
    .limit(10)
    .get();

  return artistSnap.docs.map((doc) => normalizeSong(doc));
}

/**
 * Normalize a Firestore document snapshot to the shape the bot expects.
 * Maps TuneX-specific field names to the bot's internal field names.
 *
 * @param {import('firebase-admin').firestore.DocumentSnapshot} doc
 * @returns {Object}
 */
function normalizeSong(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    // Map TuneX field names → bot field names.
    // `artistName` is the TuneX field; `artist` fallback covers any future migration.
    artist: data.artistName || data.artist || 'Desconocido',
    coverUrl: data.imageUrl || data.coverUrl || null,
  };
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

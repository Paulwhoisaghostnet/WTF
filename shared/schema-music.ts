import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  varchar,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./schema-core";

export const musicPlaylists = pgTable(
  "music_playlists",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id)
      .notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    isPublic: boolean("is_public").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("music_playlists_user_idx").on(table.userId)]
);

export const musicPlaylistTracks = pgTable(
  "music_playlist_tracks",
  {
    id: serial("id").primaryKey(),
    playlistId: integer("playlist_id")
      .references(() => musicPlaylists.id, { onDelete: "cascade" })
      .notNull(),
    tokenContract: varchar("token_contract", { length: 36 }).notNull(),
    tokenId: text("token_id").notNull(),
    title: varchar("title", { length: 300 }),
    artist: varchar("artist", { length: 200 }),
    audioUrl: text("audio_url"),
    position: integer("position").default(0).notNull(),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (table) => [index("music_playlist_tracks_playlist_idx").on(table.playlistId)]
);

export const musicListeningHistory = pgTable(
  "music_listening_history",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id)
      .notNull(),
    tokenContract: varchar("token_contract", { length: 36 }),
    tokenId: text("token_id"),
    title: varchar("title", { length: 300 }),
    playedAt: timestamp("played_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("music_history_user_idx").on(table.userId)]
);

export const musicNowPlaying = pgTable("music_now_playing", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id),
  tokenContract: varchar("token_contract", { length: 36 }),
  tokenId: text("token_id"),
  title: varchar("title", { length: 300 }),
  artist: varchar("artist", { length: 200 }),
  isPlaying: boolean("is_playing").default(false).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const musicPlaylistsRelations = relations(musicPlaylists, ({ one, many }) => ({
  user: one(users, { fields: [musicPlaylists.userId], references: [users.id] }),
  tracks: many(musicPlaylistTracks),
}));

export const musicPlaylistTracksRelations = relations(musicPlaylistTracks, ({ one }) => ({
  playlist: one(musicPlaylists, {
    fields: [musicPlaylistTracks.playlistId],
    references: [musicPlaylists.id],
  }),
}));

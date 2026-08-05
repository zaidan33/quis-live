import {
    pgTable,
    uuid,
    text,
    integer,
    boolean,
    timestamp,
    jsonb,
    pgEnum,
    index,
    uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { user } from "./auth";

/* ------------------------------------------------- enums */
export const questionTypeEnum = pgEnum("question_type", [
    "multiple_choice",
    "true_false",
]);

export const gameStatusEnum = pgEnum("game_status", [
    "lobby",
    "in_progress",
    "finished",
    "aborted",
]);

/** Bobot poin per soal (PRD 4.2 QUIZ-6). */
export const BASE_POINTS = {
    NONE: 0,
    STANDARD: 1000,
    DOUBLE: 2000,
} as const;

/** Batas waktu yang diperbolehkan per soal, dalam detik (PRD 4.2 QUIZ-5). */
export const ALLOWED_TIME_LIMITS_SEC = [5, 10, 20, 30, 60, 90, 120] as const;

export type GameSessionSettings = {
    streakBonus: boolean;
    showAnswersOnPlayerDevice: boolean;
    randomizeQuestions: boolean;
};

/* ----------------------------------------------------- quiz */
export const quiz = pgTable(
    "quiz",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        ownerId: text("owner_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        title: text("title").notNull(),
        description: text("description"),
        coverImageUrl: text("cover_image_url"),
        isDeleted: boolean("is_deleted").notNull().default(false),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (t) => [index("quiz_owner_idx").on(t.ownerId)],
);

/* ------------------------------------------------- question */
export const question = pgTable(
    "question",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        quizId: uuid("quiz_id")
            .notNull()
            .references(() => quiz.id, { onDelete: "cascade" }),
        order: integer("order").notNull(),
        type: questionTypeEnum("type").notNull().default("multiple_choice"),
        text: text("text").notNull(),
        imageUrl: text("image_url"),
        timeLimitSec: integer("time_limit_sec").notNull().default(20),
        basePoints: integer("base_points").notNull().default(1000), // 0 | 1000 | 2000
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (t) => [uniqueIndex("question_quiz_order_idx").on(t.quizId, t.order)],
);

/* ----------------------------------------------- answerOption */
export const answerOption = pgTable(
    "answer_option",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        questionId: uuid("question_id")
            .notNull()
            .references(() => question.id, { onDelete: "cascade" }),
        order: integer("order").notNull(), // 0..3 → warna/bentuk tombol
        text: text("text").notNull(),
        isCorrect: boolean("is_correct").notNull().default(false),
    },
    (t) => [index("option_question_idx").on(t.questionId)],
);

/* ----------------------------------------------- gameSession */
export const gameSession = pgTable(
    "game_session",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        quizId: uuid("quiz_id")
            .notNull()
            .references(() => quiz.id, { onDelete: "restrict" }),
        hostId: text("host_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        pin: text("pin").notNull(),
        status: gameStatusEnum("status").notNull().default("lobby"),
        currentQuestionIndex: integer("current_question_index")
            .notNull()
            .default(-1),
        settings: jsonb("settings")
            .$type<GameSessionSettings>()
            .notNull()
            .default({
                streakBonus: false,
                showAnswersOnPlayerDevice: false,
                randomizeQuestions: false,
            }),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        startedAt: timestamp("started_at"),
        endedAt: timestamp("ended_at"),
    },
    (t) => [
        // PIN hanya wajib unik untuk sesi yang belum selesai.
        // Dibuat sebagai partial unique index lewat SQL manual di migrasi
        // (lihat catatan IMPLEMENTATION_PLAN.md bagian 3).
        index("session_pin_idx").on(t.pin),
        index("session_host_idx").on(t.hostId),
    ],
);

/* ----------------------------------------------- participant */
export const participant = pgTable(
    "participant",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        gameSessionId: uuid("game_session_id")
            .notNull()
            .references(() => gameSession.id, { onDelete: "cascade" }),
        nickname: text("nickname").notNull(),
        finalScore: integer("final_score").notNull().default(0),
        finalRank: integer("final_rank"),
        correctCount: integer("correct_count").notNull().default(0),
        joinedAt: timestamp("joined_at").notNull().defaultNow(),
        leftAt: timestamp("left_at"),
    },
    (t) => [
        uniqueIndex("participant_session_nickname_idx").on(
            t.gameSessionId,
            t.nickname,
        ),
    ],
);

/* ----------------------------------------- participantAnswer */
export const participantAnswer = pgTable(
    "participant_answer",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        participantId: uuid("participant_id")
            .notNull()
            .references(() => participant.id, { onDelete: "cascade" }),
        questionId: uuid("question_id")
            .notNull()
            .references(() => question.id, { onDelete: "cascade" }),
        selectedOptionId: uuid("selected_option_id").references(
            () => answerOption.id,
            { onDelete: "set null" },
        ),
        isCorrect: boolean("is_correct").notNull(),
        responseTimeMs: integer("response_time_ms"), // null = tidak menjawab
        pointsAwarded: integer("points_awarded").notNull().default(0),
        answeredAt: timestamp("answered_at").notNull().defaultNow(),
    },
    (t) => [
        uniqueIndex("answer_participant_question_idx").on(
            t.participantId,
            t.questionId,
        ),
        index("answer_question_idx").on(t.questionId),
    ],
);

/* ------------------------------------------- relasi (metadata ORM) */
// Hanya metadata untuk Drizzle relational query (db.query.*.with). Tidak
// mengubah skema database, jadi tidak perlu migrasi baru.
export const quizRelations = relations(quiz, ({ many }) => ({
    questions: many(question),
    sessions: many(gameSession),
}));

export const questionRelations = relations(question, ({ one, many }) => ({
    quiz: one(quiz, { fields: [question.quizId], references: [quiz.id] }),
    options: many(answerOption),
    answers: many(participantAnswer),
}));

export const answerOptionRelations = relations(answerOption, ({ one, many }) => ({
    question: one(question, {
        fields: [answerOption.questionId],
        references: [question.id],
    }),
    selectedBy: many(participantAnswer),
}));

export const gameSessionRelations = relations(gameSession, ({ one, many }) => ({
    quiz: one(quiz, { fields: [gameSession.quizId], references: [quiz.id] }),
    host: one(user, { fields: [gameSession.hostId], references: [user.id] }),
    participants: many(participant),
}));

export const participantRelations = relations(participant, ({ one, many }) => ({
    session: one(gameSession, {
        fields: [participant.gameSessionId],
        references: [gameSession.id],
    }),
    answers: many(participantAnswer),
}));

export const participantAnswerRelations = relations(
    participantAnswer,
    ({ one }) => ({
        participant: one(participant, {
            fields: [participantAnswer.participantId],
            references: [participant.id],
        }),
        question: one(question, {
            fields: [participantAnswer.questionId],
            references: [question.id],
        }),
        selectedOption: one(answerOption, {
            fields: [participantAnswer.selectedOptionId],
            references: [answerOption.id],
        }),
    }),
);

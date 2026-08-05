CREATE TYPE "public"."game_status" AS ENUM('lobby', 'in_progress', 'finished', 'aborted');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('multiple_choice', 'true_false');--> statement-breakpoint
CREATE TABLE "answer_option" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"text" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"host_id" text NOT NULL,
	"pin" text NOT NULL,
	"status" "game_status" DEFAULT 'lobby' NOT NULL,
	"current_question_index" integer DEFAULT -1 NOT NULL,
	"settings" jsonb DEFAULT '{"streakBonus":false,"showAnswersOnPlayerDevice":false,"randomizeQuestions":false}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "participant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_session_id" uuid NOT NULL,
	"nickname" text NOT NULL,
	"final_score" integer DEFAULT 0 NOT NULL,
	"final_rank" integer,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "participant_answer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"selected_option_id" uuid,
	"is_correct" boolean NOT NULL,
	"response_time_ms" integer,
	"points_awarded" integer DEFAULT 0 NOT NULL,
	"answered_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"type" "question_type" DEFAULT 'multiple_choice' NOT NULL,
	"text" text NOT NULL,
	"image_url" text,
	"time_limit_sec" integer DEFAULT 20 NOT NULL,
	"base_points" integer DEFAULT 1000 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"cover_image_url" text,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answer_option" ADD CONSTRAINT "answer_option_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_session" ADD CONSTRAINT "game_session_quiz_id_quiz_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quiz"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_session" ADD CONSTRAINT "game_session_host_id_user_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant" ADD CONSTRAINT "participant_game_session_id_game_session_id_fk" FOREIGN KEY ("game_session_id") REFERENCES "public"."game_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_answer" ADD CONSTRAINT "participant_answer_participant_id_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_answer" ADD CONSTRAINT "participant_answer_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_answer" ADD CONSTRAINT "participant_answer_selected_option_id_answer_option_id_fk" FOREIGN KEY ("selected_option_id") REFERENCES "public"."answer_option"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_quiz_id_quiz_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quiz"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz" ADD CONSTRAINT "quiz_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "option_question_idx" ON "answer_option" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "session_pin_idx" ON "game_session" USING btree ("pin");--> statement-breakpoint
CREATE INDEX "session_host_idx" ON "game_session" USING btree ("host_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participant_session_nickname_idx" ON "participant" USING btree ("game_session_id","nickname");--> statement-breakpoint
CREATE UNIQUE INDEX "answer_participant_question_idx" ON "participant_answer" USING btree ("participant_id","question_id");--> statement-breakpoint
CREATE INDEX "answer_question_idx" ON "participant_answer" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_quiz_order_idx" ON "question" USING btree ("quiz_id","order");--> statement-breakpoint
CREATE INDEX "quiz_owner_idx" ON "quiz" USING btree ("owner_id");--> statement-breakpoint
-- Partial unique index: PIN hanya wajib unik di antara sesi yang belum selesai.
-- Menjamin tak ada dua sesi aktif ber-PIN sama, tapi PIN lama boleh dipakai ulang
-- setelah game selesai (PRD 6.3, IMPLEMENTATION_PLAN bagian 3).
-- Drizzle belum mendukung partial unique index deklaratif, jadi ditambah manual.
CREATE UNIQUE INDEX "session_active_pin_unique" ON "game_session" USING btree ("pin") WHERE status IN ('lobby', 'in_progress');
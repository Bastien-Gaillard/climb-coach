CREATE TABLE "mobility_routines" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"minutes" smallint NOT NULL,
	"intro" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mobility_steps" (
	"routine_id" text NOT NULL,
	"id" text NOT NULL,
	"position" smallint NOT NULL,
	"title" text NOT NULL,
	"dose" text NOT NULL,
	"seconds" smallint NOT NULL,
	"instruction" text NOT NULL,
	"sides" boolean DEFAULT false NOT NULL,
	"video" text NOT NULL,
	"info" jsonb NOT NULL,
	CONSTRAINT "mobility_steps_routine_id_id_pk" PRIMARY KEY("routine_id","id"),
	CONSTRAINT "mobility_steps_routine_position_uq" UNIQUE("routine_id","position")
);
--> statement-breakpoint
ALTER TABLE "mobility_steps" ADD CONSTRAINT "mobility_steps_routine_id_mobility_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."mobility_routines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Contenu de la routine « souplesse » des jours de pause
INSERT INTO "mobility_routines" ("id", "title", "minutes", "intro") VALUES ('souplesse', 'Souplesse', 15, 'À faire chez toi, sans matériel. Lentement, sans forcer : tu dois pouvoir respirer normalement.');--> statement-breakpoint
INSERT INTO "mobility_steps" ("routine_id", "id", "position", "title", "dose", "seconds", "instruction", "sides", "video", "info") VALUES
	('souplesse', 'cat-cow', 1, 'Chat-vache', '1 min', 60, 'À quatre pattes, alterne dos creux et dos rond, lentement.', false, 'https://www.youtube.com/results?search_query=cat%20cow%20stretch', '{"why":"Délier le bassin et le bas du dos avant le reste.","how":["Le mouvement part du bassin, la tête suit","Inspire en creusant, expire en arrondissant"],"pitfalls":["Aller vite","Ne bouger que la tête et les épaules"]}'::jsonb),
	('souplesse', '90-90', 2, '90/90', '2 min', 120, 'Assis, une jambe pliée devant, l’autre pliée sur le côté. Bascule les genoux d’un côté à l’autre, 10 fois.', false, 'https://www.youtube.com/results?search_query=90%2090%20hip%20switch%20mobility', '{"why":"La rotation de hanche, celle des lolottes et des hanches qui pivotent contre le mur.","how":["Buste droit, mains au sol derrière si besoin","Plus tard : sans les mains"],"pitfalls":["S’affaisser en arrière","Forcer sur un genou qui tire"]}'::jsonb),
	('souplesse', 'low-lunge', 3, 'Fente basse', '1 min par côté', 120, 'Genou arrière au sol, pousse doucement le bassin vers l’avant.', true, 'https://www.youtube.com/results?search_query=low%20lunge%20hip%20flexor%20stretch', '{"why":"Ouvrir l’avant de la hanche, raide après une journée assis, pour coller le bassin au mur en dévers.","how":["Serre la fesse de la jambe arrière","L’étirement se sent devant la hanche"],"pitfalls":["Creuser le bas du dos au lieu d’avancer le bassin"]}'::jsonb),
	('souplesse', 'cossack-squat', 4, 'Squat cosaque', '2 × 5 par côté', 120, 'Pieds très écartés, descends sur une jambe, l’autre tendue, talon au sol.', false, 'https://www.youtube.com/results?search_query=cossack%20squat%20beginner', '{"why":"Charger un pied loin sur le côté, comme sur un pied écarté au mur.","how":["Descends seulement jusqu’où le talon reste au sol","Aide-toi d’un meuble au début"],"pitfalls":["Talon qui décolle","Genou qui rentre vers l’intérieur"]}'::jsonb),
	('souplesse', 'frog', 5, 'Grenouille', '1 min 30', 90, 'À quatre pattes, genoux écartés, pieds en dehors, recule doucement les fesses.', false, 'https://www.youtube.com/results?search_query=frog%20stretch%20hip%20mobility', '{"why":"La position hanches ouvertes face au mur.","how":["Sur les avant-bras, petits allers-retours avant de tenir la position","Un coussin sous les genoux"],"pitfalls":["Forcer en douleur à l’aine"]}'::jsonb),
	('souplesse', 'high-step', 6, 'Pied haut', '5 par côté', 90, 'Face à un mur, sans les mains, monte un pied le plus haut possible et tiens-le 3 s.', true, 'https://www.youtube.com/results?search_query=high%20step%20mobility%20climbing', '{"why":"De la force en fin d’amplitude. C’est le geste le plus lié au niveau en escalade.","how":["Hanche collée au mur, genou vers l’extérieur","Note un repère pour suivre tes progrès"],"pitfalls":["Se pencher en arrière pour tricher"]}'::jsonb),
	('souplesse', 'upper-back', 7, 'Haut du dos', '2 min', 120, 'Livre ouvert (5 par côté), puis 10 floor angels.', false, 'https://www.youtube.com/results?search_query=open%20book%20stretch%20floor%20angels', '{"why":"Contrer les épaules enroulées par la grimpe et l’écran, et laisser l’omoplate glisser librement.","how":["Livre ouvert allongé sur le côté, genoux pliés","Le bras du dessus s’ouvre et le regard le suit"],"pitfalls":["Faire tourner le bassin à la place du haut du dos"]}'::jsonb);

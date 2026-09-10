#!/usr/bin/env node
import assert from "node:assert/strict";
import { eventSceneChip, EVENT_SCENE_LABEL, EVENT_SCENE_TITLE } from "../lib/eventImageDisclosure.js";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };

const stock = "https://images.pexels.com/photos/fixture/scene.jpg";
const real = "https://ticketmaster.example/event.jpg";

const chip = eventSceneChip({ imageScene: true, image: stock }, stock);
ok(chip?.label === "Scene photo", "a rendered stock scene carries the visible Scene photo label");
ok(chip?.title === EVENT_SCENE_TITLE && EVENT_SCENE_TITLE.includes("not a photo of the named event"), "the disclosure says what the image is not");
ok(EVENT_SCENE_LABEL === "Scene photo", "the short visible disclosure stays stable");

ok(eventSceneChip({ imageScene: false, image: real }, real) === null, "a real event image is never mislabeled as a scene");
ok(eventSceneChip({ imageScene: true, image: stock }, "/cards/events/festival.jpg") === null, "category art is not mislabeled when stock imagery was suppressed");
ok(eventSceneChip({ imageScene: true, image: stock, thumb: real }, real) === null, "a different selected thumbnail is not mislabeled because a hidden stock URL exists");
ok(eventSceneChip({ imageScene: true, image: "" }, "") === null, "an absent stock image never creates a disclosure chip");

console.log(`test-event-scene-disclosure: ${checks} assertions passed`);

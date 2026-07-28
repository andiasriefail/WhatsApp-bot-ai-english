'use strict'

// ─── INSPIRATION MODULE ─────────────────────────────────────────────────────────
// Contains a collection of 15 Motivations, 15 Fun Facts, 15 Reflections, and 15 Philosophical thoughts.
// Each command is chosen randomly so every user gets a different one.
// All content is original work written specifically for this bot.
// ─────────────────────────────────────────────────────────────────────────────

// ─── MOTIVATION ──────────────────────────────────────────────────────────────────

const MOTIVATION_LIST = [
    `You don't have to see the whole staircase. Just take the first step — the rest will become visible once you start moving.`,
    `Successful people are not those who never fail. They are the ones who, every time they fall, choose to get back up one more time.`,
    `Don't compare your journey to someone else's. You are running your own race, with different weights and distances.`,
    `The best thing you can do today is start — even if you're not ready, even if it's not perfect, even if you're still afraid.`,
    `Success isn't about how fast you arrive. It's about whether you're still walking when everyone else has given up.`,
    `Feeling tired is okay. Taking a short break is okay. What's not okay is giving up and never coming back.`,
    `Every day is a new chance to become a better version of yourself than you were yesterday. No need to make big leaps — one step forward is enough.`,
    `You are stronger than you think. Proof: every single hard day you've ever faced — you made it through all of them.`,
    `Big dreams require big courage. But courage doesn't come before action — it comes alongside it.`,
    `Don't wait for motivation to show up before you move. Start moving — motivation will catch up along the way.`,
    `Change doesn't happen in the comfort zone. But the comfort zone has never produced a story worth telling either.`,
    `No effort is wasted. What looks like failure today is often the foundation being built for tomorrow.`,
    `Stop comparing your chapter one to someone else's chapter three. Everyone has their own timeline and their own process.`,
    `One small habit done every day is more powerful than one grand resolution that lives only in your head.`,
    `Your life is not determined by what happens to you, but by how you choose to respond to it.`
]

// ─── FUN FACTS ───────────────────────────────────────────────────────────────────

const FUN_FACT_LIST = [
    `🧠 Your brain uses about 20% of your body's total energy — even though it only makes up roughly 2% of your body weight. It's the most energy-hungry organ you own.`,
    `🐙 Octopuses have three hearts and blue blood. Two hearts pump blood to the gills, while one pumps it to the rest of the body. When an octopus swims, its main heart actually stops beating — which is why they prefer crawling.`,
    `🌊 More than 80% of the world's oceans have never been explored by humans. We actually know more about the surface of the Moon than we do about the depths of our own seas.`,
    `🍯 Honey never spoils. Archaeologists have found 3,000-year-old honey in ancient Egyptian tombs — and it was still edible. Its high sugar content and low pH make it impossible for bacteria to survive in.`,
    `🌳 Trees in forests communicate with each other through underground fungal networks. Scientists call it the "Wood Wide Web" — older trees can even send nutrients to younger trees that aren't getting enough light.`,
    `⚡ Lightning strikes the Earth about 100 times every second. By the time you finish reading this fact, thousands of lightning bolts have already struck somewhere around the world.`,
    `🐘 Elephants are the only animals besides humans known to perform rituals to honor their dead. They can stand silently for hours beside the body of a fallen herd member.`,
    `🌙 The Moon is moving away from Earth at about 3.8 centimeters per year. Billions of years ago, it was much closer, causing Earth to spin faster — a single day was only about 6 hours long.`,
    `🧬 If all the DNA in your body were stretched out end to end, it would reach about 200 billion kilometers — enough to travel to Pluto and back more than 13 times.`,
    `🐝 A honeybee must visit around 2 million flowers and fly over 90,000 kilometers just to produce one 500-gram jar of honey. A single worker bee produces only about one teaspoon of honey in its entire lifetime.`,
    `🌡️ The surface of the Sun is about 5,500 degrees Celsius. But strangely, the Sun's outer atmosphere (the corona) can reach 2 million degrees Celsius — and scientists still don't fully understand why.`,
    `🐟 Fish never truly sleep the way humans do — they have no eyelids. But they do have rest periods where their brain activity slows down significantly.`,
    `🎵 Music is scientifically proven to reduce pain. When you listen to music you love, your brain releases dopamine — the same chemical released when you eat good food or fall in love.`,
    `🪸 What looks like rock in coral reefs is actually alive. A single large reef can be home to more than 25% of all marine species on Earth, even though reefs cover less than 1% of the ocean floor.`,
    `🧲 If you could remove all the empty space between the atoms in the human body, the entire world population could fit inside a sugar cube. Your body is mostly… empty space.`
]

// ─── REFLECTION ──────────────────────────────────────────────────────────────────

const REFLECTION_LIST = [
    `We often spend our lives chasing things we think will make us happy — without realizing that so much of what we're looking for has been right in front of us all along.`,
    `There's a big difference between being busy and being productive. Busy means moving without direction. Productive means moving toward something that actually matters.`,
    `Everyone you meet is fighting a battle you know nothing about. A little kindness, even something small, can mean far more than you realize to someone who really needs it.`,
    `We can't control what happens to us. But we always have control over one thing: how we choose to respond. And that choice, more often than not, determines everything.`,
    `Time is the one resource that can't be refilled. Money can be earned back. Energy can be restored. But a second that has passed never returns.`,
    `We spend too much time waiting — for the right moment, the perfect conditions, a readiness that never comes. But life doesn't wait for us to be ready.`,
    `Happiness isn't a final destination to reach. It's a way of traveling — something chosen and practiced every day, not something found at the end of the road.`,
    `What drains us most in life isn't hard work. It's draining relationships, decisions we keep putting off, and words we never say.`,
    `We are often harder on ourselves than we'd ever be on others. Yet the best advice you'd give your closest friend — you deserve to hear it too.`,
    `A meaningful life isn't always a big or famous one. Sometimes what matters most is showing up fully for the people around you, day after day.`,
    `We worry about so many things that never actually happen. Most of our fears are stories we write in our own heads — not reality.`,
    `There's something more important than being right: being honest. And something more important than being successful: being kind. The two don't always come together.`,
    `The past can't be changed. But the way you look at the past — that can change. And often, that's what changes everything.`,
    `We don't always need solutions. Sometimes what a person needs most is simply to be heard — truly heard, without judgment, without unsolicited advice.`,
    `At the end of life, very few people regret resting too much, laughing too often, or holding the people they love for too long.`
]

// ─── PHILOSOPHICAL ───────────────────────────────────────────────────────────────

const PHILOSOPHICAL_LIST = [
    `We don't fear the dark because it's dangerous. We fear it because we can't see what's in it. Many of life's fears work the same way — not a real threat, but uncertainty we imagine into existence.`,
    `A ship in harbor is safe. But ships weren't built to stay in harbor forever. There are things in life you can only discover if you're brave enough to sail.`,
    `Humans are the only creatures that can imagine the future — and precisely because of that, the only creatures that can worry about something that hasn't happened yet.`,
    `We often think having more choices will make us happier. But too many options make us more anxious — because the more choices we have, the greater the fear of choosing wrong.`,
    `Your identity isn't about who you were yesterday. It's about the small choices you make every day — and who you are slowly becoming through those choices.`,
    `There's an interesting paradox in life: the more you try to control everything, the more things feel out of control. But when you learn to release what can't be controlled, that's when you begin to feel truly free.`,
    `We are the only species that creates meaning — in objects, events, and relationships. A plain metal ring can become a symbol of lifelong love. Not because the ring is special, but because we decided it is.`,
    `Time feels slow when we're bored and fast when we're happy — yet the seconds are exactly the same. What changes isn't time, but our attention. This teaches something: the quality of life is largely determined by where we direct our focus.`,
    `An uncomfortable truth is worth more than a comfortable lie. But humans naturally find the second easier to accept — and that's why honesty always takes courage.`,
    `We learn to walk by falling. We learn to speak by mispronouncing words. Nearly every human skill is born from repeated failure — and yet, as adults, we so often forget that failing is part of learning.`,
    `There's a difference between loneliness and solitude. Loneliness is feeling disconnected even when surrounded by people. Solitude is choosing to be present with yourself. The first is painful. The second, when practiced, can become one of the deepest forms of freedom.`,
    `We tend to judge ourselves by our intentions, but judge others by their actions. When we do something wrong, we say "I didn't mean it that way." Yet when others do wrong, we rarely stop to ask if they had a reason we don't know about.`,
    `Something that happens every day feels ordinary — until one day it's gone. Many things we take for granted only feel precious once they've disappeared. Maybe that's why gratitude must be practiced, not waited for.`,
    `The slowest changes are often the most permanent. Small habits practiced over years shape character. Stone carved by dripping water will eventually hollow — not because of the water's force, but because of its persistence.`,
    `Humans can endure extraordinary suffering, as long as they know why. What weakens us most isn't the weight of the burden, but not knowing why it must be carried.`
]

// ─── MAIN FUNCTIONS ──────────────────────────────────────────────────────────────

function getRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)]
}

function getMotivationRandom() {
    const item = getRandom(MOTIVATION_LIST)
    return (
        `💪 *MOTIVATION*\n` +
        `${'─'.repeat(30)}\n\n` +
        `${item}\n\n` +
        `${'─'.repeat(30)}\n` +
        `_Type .motivation for another motivation_ 🎲`
    )
}

function getFunFactRandom() {
    const item = getRandom(FUN_FACT_LIST)
    return (
        `🔍 *FUN FACT*\n` +
        `${'─'.repeat(30)}\n\n` +
        `${item}\n\n` +
        `${'─'.repeat(30)}\n` +
        `_Type .funfact for another fun fact_ 🎲`
    )
}

function getReflectionRandom() {
    const item = getRandom(REFLECTION_LIST)
    return (
        `🌿 *REFLECTION*\n` +
        `${'─'.repeat(30)}\n\n` +
        `${item}\n\n` +
        `${'─'.repeat(30)}\n` +
        `_Type .reflection for another reflection_ 🎲`
    )
}

function getPhilosophicalRandom() {
    const item = getRandom(PHILOSOPHICAL_LIST)
    return (
        `🧩 *PHILOSOPHICAL*\n` +
        `${'─'.repeat(30)}\n\n` +
        `${item}\n\n` +
        `${'─'.repeat(30)}\n` +
        `_Type .philosophical for another thought_ 🎲`
    )
}

module.exports = {
    getMotivationRandom,
    getFunFactRandom,
    getReflectionRandom,
    getPhilosophicalRandom
}

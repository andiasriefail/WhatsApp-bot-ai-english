'use strict'

// ─── LITERATURE MODULE ────────────────────────────────────────────────────────
// Contains a collection of 15 Short Stories, 15 Rhymes, and 15 Poems.
// Each command (.cerpen / .pantun / .puisi) picks an item at random
// so every user can get a different piece each time.
// Note: all short stories and poems in this module are original works
// written specifically for this bot.
// ─────────────────────────────────────────────────────────────────────────────

// ─── SHORT STORIES ────────────────────────────────────────────────────────────

const SHORT_STORY_LIST = [
    {
        title: 'A Letter from Mom',
        content: `Rama hadn't been home to his village in three years. The busyness of city life had made him forget just how much his mother missed him.

One evening, a worn envelope arrived on his desk. Inside was a single sheet of paper, written in a trembling hand:

"Son, when are you coming home? The mango tree in the yard is bearing fruit again. I'll cook your favourite tamarind soup."

Rama let out a long breath. He immediately reached for his phone and booked a ticket home for the next morning.

Some things in this world cannot wait. A mother's love is one of them.`
    },
    {
        title: 'Rain in June',
        content: `Dinda stood at the café window, watching the raindrops dance on the asphalt.

At the same corner table, four years ago, she had first met Adit. They had both been caught in the rain and run inside together, laughing because their shoes were soaked through.

Now Adit was married to someone else. Dinda was still here, with the same cup of coffee, and the rain still faithfully falling in June.

She smiled quietly. Some memories are more beautiful when you leave them as memories.`
    },
    {
        title: 'The Old Cat in the Narrow Alley',
        content: `Pak Hamid had been selling rice packets in that narrow alley for twenty years. His only loyal companion was an old yellow cat he'd named Gembul.

One morning, Gembul didn't show up. Pak Hamid kept waiting, occasionally glancing at the corner where Gembul usually slept.

In the afternoon, a small child arrived carrying Gembul. "Sir, your cat was hit by a motorbike this morning, but I took it to the vet. Here's the change," the child said, handing over an envelope.

Pak Hamid was speechless. It turned out that all this time, he wasn't the only one who cared for Gembul.`
    },
    {
        title: 'One Empty Chair',
        content: `Every dinner, Grandma always set six plates — even though only five people sat at the table.

We never asked. Until one night, the youngest sibling finally summoned the courage.

"Grandma, whose plate is that?"

Grandma smiled gently, then dabbed the corner of her eye with the edge of her headscarf.

"Your grandfather's. So he doesn't feel lonely if he drops by."

That night, the five of us ate in silence. But somehow, the table felt fuller than ever.`
    },
    {
        title: 'The Worn Book in the Library',
        content: `Sari stumbled across the book in the farthest corner of the shelf — its cover yellowed, smelling of old rain.

On the first page, there was a handwritten note: "To whoever finds this: your life is worth more than you think. — R, 1987."

Sari read the whole book in one sitting. On the last page was another note: "If you're struggling, remember — you found this book. That means you're still looking. And someone who is still looking has never truly given up."

Sari closed the book, then placed it back on the shelf. So that someone else might find it someday too.`
    },
    {
        title: 'The Coffee Stall at the End of the Road',
        content: `Pak Yusuf's coffee stall was never empty, even though it sat at the end of a road few people passed.

His secret wasn't the coffee he brewed — it was the way he listened. Every customer who came in, Pak Yusuf would always ask, "How's your day going?"

And he truly listened to the answer.

People came not for the coffee. They came because at Pak Yusuf's stall, they felt that someone cared.

That's the rarest thing in a big city: ears that genuinely hear.`
    },
    {
        title: 'The Broken Kite',
        content: `Bimo ran after the kite whose string had snapped in the afternoon wind.

He ran past rice fields, past a bamboo bridge, until his foot caught and he tumbled down at the edge of the river.

The kite had vanished behind the hill.

Bimo sat there alone, catching his breath. Then he laughed — laughed until his eyes watered.

Because only then did he realise: in chasing the kite, he had passed the biggest jackfruit tree he had ever seen, a river with water as clear as glass, and a sunset unfolding in perfect silence.

Sometimes what we lose teaches us to see.`
    },
    {
        title: 'A Call at Midnight',
        content: `At two in the morning, Nisa's phone buzzed. Unknown number.

"Hello?" Her voice was hoarse with sleep.

"Sorry to bother you. This… this is still your old number, right? You once told me that if I ever needed to talk to someone, I could call you."

Nisa went still. The voice belonged to a high school friend — someone she hadn't heard from in seven years.

"Yes," Nisa said softly. "I'm here. Go ahead and talk."

And they talked until dawn. Some friendships aren't the ones you see most often — they're the ones most ready to show up when it matters.`
    },
    {
        title: 'The Cracked Mirror',
        content: `Maya stood before the mirror with a crack in its upper left corner — a mirror left behind by her grandmother.

Every morning, she saw herself split in two: the part that had already healed, and the part still in the process of healing.

People told her to replace it. But Maya refused.

Because that cracked mirror was honest. It didn't hide the fact that something had once broken. It only proved that even cracked, it could still reflect light.

And that was more than enough.`
    },
    {
        title: 'The Farmer and the Stars',
        content: `Every night after a long day in the fields, Pak Darmo would sit on the porch and gaze at the stars.

His grandchild asked, "Grandpa, what are you doing?"

"Chatting with the stars," Pak Darmo answered with a smile.

"Can the stars talk?"

Pak Darmo nodded slowly. "If you're willing to listen. They say: no matter how tired today was, the light is still there. Even on the darkest nights."

The little grandchild stared up at the sky seriously, as if truly trying to hear.`
    },
    {
        title: 'The Birthday Gift',
        content: `Rudi woke on his birthday hoping to find at least one message on his phone.

There was none.

He went to work quietly. When he came home, his front door was locked from the inside — even though he lived alone.

He knocked. Then the lights came on and the door swung open.

Inside, all his old friends stood holding a cake. They hadn't forgotten. They had simply made Rudi wait, so the surprise would hit harder.

Some things in life do take time — not because they've been forgotten, but because they're being prepared with real care.`
    },
    {
        title: 'The Teacher Who Never Taught in a Classroom',
        content: `Bu Lastri ran the school canteen. Not a teacher, not teaching staff. Yet students told her more than they told anyone else.

In front of her affordable rice packets, many children confessed their fears: of failing the year, of getting scolded at home, of having no friends.

Bu Lastri always listened, then said, "Eat first. Any problem feels lighter on a full stomach."

Years later, many alumni came back — not to visit their teachers, but to have lunch at Bu Lastri's canteen and simply sit there for a while.`
    },
    {
        title: 'The Old Bicycle',
        content: `My father could never afford a motorbike. But his bicycle was always clean and well cared for.

Every morning, he pedalled eight kilometres to the market. He'd come home in the evening with a smile and groceries for us.

I used to be embarrassed being dropped at school by bicycle. Now I am embarrassed that I ever felt that way.

Because nothing is more admirable than a father who pedals his own tiredness, just to make sure his child never goes without.`
    },
    {
        title: 'The First Rain',
        content: `Layla had never seen rain. She was born and raised in a hot, dry desert city.

One day, at twenty-three years old, she was at an airport in transit when her first rain began to fall.

She stepped outside the terminal — letting herself get soaked — while everyone else ran for cover.

An airport officer came with an umbrella. Layla shook her head and laughed.

"Sorry," she said. "This is the first time I've ever stood in the rain."

The officer paused for a moment, then stepped out into the rain and stood beside her.`
    },
    {
        title: 'The Last Message',
        content: `Before Grandpa passed, he called each of his grandchildren in one by one.

When it was Aldi's turn, Grandpa gripped his hand tightly.

"I want to tell you the secret to a long life," he whispered weakly.

Aldi leaned in close.

"Always apologise first. Don't wait for the other person. And never go to sleep angry at anyone."

Grandpa smiled, then closed his eyes to rest.

Aldi didn't know it would be his last sleep. But he never forgot the words — and he made them his way of living.`
    }
]

// ─── RHYMES ───────────────────────────────────────────────────────────────────

const RHYME_LIST = [
    {
        verse: `A basket of apples sits by the creek,\nOne drops and rolls to the old oak tree.\nWho could help but blush and peek,\nAt a smile as warm as the morning breeze.`
    },
    {
        verse: `Walking to market, picking up greens,\nDon't forget the peppers, bright and red.\nLife is clearer than it often seems,\nFace each day with a cheerful head.`
    },
    {
        verse: `Wild berries ripen on the hill,\nRound and red against the summer sky.\nWhen your thoughts refuse to stay still,\nBreathe in deep and count to five or nine.`
    },
    {
        verse: `Fish are darting in the pond below,\nThis way, that way, swift and free.\nThough life's waters ebb and flow,\nGratitude keeps the heart at sea.`
    },
    {
        verse: `Rain falls gently from a cloudy sky,\nSoaking the earth that thirsted long.\nKnowledge is worth the years gone by,\nFor learning is a neverending song.`
    },
    {
        verse: `A sparrow wings its way up north,\nResting briefly in the tallest pine.\nStudy hard from early youth and forth,\nSo a brighter future starts to shine.`
    },
    {
        verse: `A sailboat crossing open seas,\nCarries cargo from a distant shore.\nLove that's honest, built on trust with ease,\nIs the kind that grows and lasts and more.`
    },
    {
        verse: `A fawn leaps lightly through the field,\nLight as morning air on dewy grass.\nPatience is the finest shield,\nLetting storms and troubles pass.`
    },
    {
        verse: `Pick jasmine flowers at the break of day,\nTheir sweetness drifts across the garden gate.\nTrue friendship never fades away,\nIt shows up truest when we can't wait.`
    },
    {
        verse: `Cucumbers grow behind the garden wall,\nMother picks them in the early light.\nLet go of grudges, big or small,\nForgive, and let your spirit feel light.`
    },
    {
        verse: `A kite soars up into the blue,\nIts long white string trailing clean and bright.\nWhen longing fills you through and through,\nWrite it down on a note tonight.`
    },
    {
        verse: `Young coconuts line the sandy shore,\nSweet and cool beneath the midday sun.\nThose who strive and work for more,\nWill find their destination won.`
    },
    {
        verse: `Buying cloth across the lane,\nSmooth and blue and gently pressed.\nDon't let time slip by in vain,\nHours gone are gone — do your best.`
    },
    {
        verse: `A bee alights on every flower,\nSeeking sweets the blooms provide.\nWisdom deepens hour by hour,\nGuiding those who live with pride.`
    },
    {
        verse: `Roses bloom in morning light,\nOpening wide in the clear cool air.\nLife is filled with gifts so bright,\nGrateful hearts find wonder everywhere.`
    }
]

// ─── POEMS ────────────────────────────────────────────────────────────────────

const POEM_LIST = [
    {
        title: 'What the Rain Leaves Behind',
        verse: `After the rain has gone
there are still small puddles
reflecting the sky
as if to say:
beautiful things don't always have to last long
to leave a mark.`
    },
    {
        title: 'Mother',
        verse: `Your wrinkled hands
are the map of a long journey
you never talk about

but I read it
every time you smooth my hair
and say: it's okay, just sleep now.`
    },
    {
        title: 'Night City',
        verse: `Among the street lights
blinking half-dead
I walk home

carrying a tiredness
I don't need
to tell anyone —
because some things
are better resolved
with enough sleep.`
    },
    {
        title: 'On Growing',
        verse: `A tree does not grow in a hurry
it simply stays
and gathers rain
little by little

you are the same —
you don't have to look like you're moving forward every day
as long as your roots go deeper
and you don't stop drinking the light.`
    },
    {
        title: 'A Conversation with the Sea',
        verse: `The sea told me:
I am not tired of making waves
that is not anger
it is just how I live

then it pulled back slowly
leaving the sand clean
and I understood —
some things must keep repeating
so that something becomes clear.`
    },
    {
        title: 'A Note to Myself',
        verse: `It's okay
you haven't gotten there yet

it's okay
you're still feeling your way through the dark

it's okay
your heart is stronger than you think —

you have held on
far longer than you ever imagined
and that is no small thing.`
    },
    {
        title: 'One Chair by the Window',
        verse: `Here in this café I sit alone
with a cup of coffee gone cold
and a book I haven't opened

not because I have nothing to do
but because there are moments
when stillness is the most important work
a person can do.`
    },
    {
        title: 'The First Autumn',
        verse: `Leaves fall
not because they were defeated
but because it was simply time
to make way for what comes next

there is a lesson in every leaving —
that letting go
does not always mean giving up.`
    },
    {
        title: 'For You Who Are Struggling',
        verse: `You don't have to be strong every day
there are days
when getting out of bed
is already a victory

and victories don't have to be big
to deserve to be celebrated —
even one step forward
on the heaviest day
is an act of courage.`
    },
    {
        title: 'Stars in Daylight',
        verse: `Stars don't disappear when day arrives
they are simply unseen
but they're still there
shining faithfully

you are the same —
just because you're not always visible
doesn't mean you're not there
doesn't mean your light has gone out.`
    },
    {
        title: 'On Time',
        verse: `Time never waits
but it never shouts either
it just walks quietly
and shrugs —

what you do or don't do
will both become memories
the only difference is one:
whether you chose, or were chosen for.`
    },
    {
        title: 'Home',
        verse: `Home is not only walls and a roof
sometimes home is an embrace
that needs no words

or a cup of tea in the morning
prepared by someone
before you even wake —

that is the truest home:
a place where someone already knows
what you need.`
    },
    {
        title: 'Learning from the Ant',
        verse: `The ant never asks
whether the load is too heavy

it simply walks
and when it stumbles
it gets up again

perhaps that is the only
philosophy of life we need:
keep walking
and remember to stand up again
every time you fall.`
    },
    {
        title: 'The Night Before the Rain',
        verse: `The air smells of earth tonight
a sign the rain is coming

I sit outside
letting the wind touch my face
and I think how simple it is
to be happy:

just be here
in this place
at this moment
with a heart that isn't in a hurry.`
    },
    {
        title: 'The Letter Never Sent',
        verse: `There are words I never said
not because I didn't want to
but because some things
are stronger than words

like sitting beside you
while you cry
without asking why —

because sometimes presence
is the most fluent language
a person has.`
    }
]

// ─── MAIN FUNCTIONS ────────────────────────────────────────────────────────────

function getRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)]
}

function getShortStoryRandom() {
    const story = getRandom(SHORT_STORY_LIST)
    return (
        `📖 *SHORT STORY* — _${story.title}_\n` +
        `${'─'.repeat(30)}\n\n` +
        `${story.content}\n\n` +
        `${'─'.repeat(30)}\n` +
        `_Type .story for another story_ 🎲`
    )
}

function getRhymeRandom() {
    const rhyme = getRandom(RHYME_LIST)
    return (
        `🎭 *RHYME*\n` +
        `${'─'.repeat(30)}\n\n` +
        `_${rhyme.verse}_\n\n` +
        `${'─'.repeat(30)}\n` +
        `_Type .rhyme for another rhyme_ 🎲`
    )
}

function getPoemRandom() {
    const poem = getRandom(POEM_LIST)
    return (
        `🌹 *POEM* — _${poem.title}_\n` +
        `${'─'.repeat(30)}\n\n` +
        `${poem.verse}\n\n` +
        `${'─'.repeat(30)}\n` +
        `_Type .poem for another poem_ 🎲`
    )
}

function getRiddleRandom() {
    return null
}

module.exports = {
    getShortStoryRandom,
    getRhymeRandom,
    getPoemRandom,
    getRiddleRandom
}

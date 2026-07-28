'use strict'

const QUIZ_LIST = [
    {
        question: '🧠 If 2+3=10, 3+4=21, 4+5=32, then 5+6=?',
        options: ['A. 40', 'B. 42', 'C. 45', 'D. 11'],
        answer: 'C',
        explanation: 'The pattern is: a+b = (a×b) - a. So 5+6 = (5×6) - 5 = 30 - 5 = 45. Many people jump to 11 because they miss the hidden pattern.'
    },
    {
        question: '🧠 What is half of two plus two?',
        options: ['A. 1', 'B. 2', 'C. 3', 'D. 4'],
        answer: 'C',
        explanation: '"Half of two" = ½×2 = 1, then add 2 = 3. Many misread it as "half of (two plus two)" = ½×4 = 2.'
    },
    {
        question: '🧠 5 machines make 5 shirts in 5 minutes. How many minutes does it take 100 machines to make 100 shirts?',
        options: ['A. 100 minutes', 'B. 50 minutes', 'C. 10 minutes', 'D. 5 minutes'],
        answer: 'D',
        explanation: '1 machine makes 1 shirt in 5 minutes. If 100 machines run at the same time, each still takes 5 minutes. The answer stays 5 minutes, not 100.'
    },
    {
        question: '🧠 5 hens lay 5 eggs in 5 days. How many eggs do 10 hens lay in 10 days?',
        options: ['A. 100 eggs', 'B. 25 eggs', 'C. 50 eggs', 'D. 20 eggs'],
        answer: 'D',
        explanation: '1 hen lays 1 egg in 5 days. In 10 days, 1 hen lays 2 eggs. So 10 hens × 2 eggs = 20 eggs. Not 100, as most people answer.'
    },
    {
        question: '🧠 How many months in a year have 28 days?',
        options: ['A. 1 month', 'B. 2 months', 'C. 4 months', 'D. 12 months'],
        answer: 'D',
        explanation: 'All months have at least 28 days! February has exactly 28 days, but every other month has 28 days too (plus extras). So the answer is 12 months.'
    },
    {
        question: '🧠 You have 3 apples and take 2. How many apples do you have?',
        options: ['A. 1 apple', 'B. 2 apples', 'C. 3 apples', 'D. 5 apples'],
        answer: 'B',
        explanation: 'You *took* 2 apples, so you have 2 in your hands. Not 1 (what\'s left behind). The trick is that the brain automatically calculates what remains, not what you took.'
    },
    {
        question: '🧠 A doctor has a brother, but that man has no brother. Who is the doctor?',
        options: ['A. A twin', 'B. A woman doctor', 'C. The doctor himself', 'D. No one'],
        answer: 'B',
        explanation: 'The doctor is a woman. Her brother has a sister (the doctor), but no brother. Many fall into the trap of assuming the doctor is male.'
    },
    {
        question: '🧠 There are 6 apples and you take 4. How many apples do you have?',
        options: ['A. 2 apples', 'B. 4 apples', 'C. 6 apples', 'D. 10 apples'],
        answer: 'B',
        explanation: 'You took 4 apples, so you have 4. The 2 remaining are still in the original place. The brain often counts what\'s left rather than what was taken.'
    },
    {
        question: '🧠 A plane crashes right on the border of two countries. Where do you bury the survivors?',
        options: ['A. Country A', 'B. Country B', 'C. Both countries', 'D. You don\'t bury survivors'],
        answer: 'D',
        explanation: 'You don\'t bury survivors! They are alive. The brain jumps to the border detail and misses the key word: "survivors".'
    },
    {
        question: '🧠 In a race, you overtake the person in 2nd place. What place are you now in?',
        options: ['A. 1st place', 'B. 2nd place', 'C. 3rd place', 'D. 4th place'],
        answer: 'B',
        explanation: 'You overtook the person in 2nd place, so you took their position — 2nd place. You are not in 1st unless you also overtake the leader.'
    },
    {
        question: '🧠 Two fathers and two sons go fishing. Each catches 1 fish. Only 3 fish total. How?',
        options: ['A. Someone caught nothing', 'B. Someone caught 2', 'C. There are only 3 people', 'D. The question is wrong'],
        answer: 'C',
        explanation: 'There are only three people: grandfather, father, and son. The father is both a father (to the son) and a son (to the grandfather). So "two fathers" and "two sons" overlap.'
    },
    {
        question: '🧠 Which is heavier: 1 kg of iron or 1 kg of cotton?',
        options: ['A. Iron is heavier', 'B. Cotton is heavier', 'C. They weigh the same', 'D. It depends on the type'],
        answer: 'C',
        explanation: 'Both are 1 kg! The brain gets tricked because iron feels heavier in daily life, but the question already states they both weigh the same: 1 kg.'
    },
    {
        question: '🧠 A pilot flies without a driver\'s licence. Is that legal?',
        options: ['A. Not legal', 'B. Legal', 'C. Depends on the airline', 'D. Must have a licence'],
        answer: 'B',
        explanation: 'Perfectly legal! A pilot doesn\'t need a driver\'s licence — that\'s for road vehicles. Pilots hold a flight licence (ATPL/CPL), which is completely different.'
    },
    {
        question: '🧠 There are 10 birds on a branch. A hunter shoots 1. How many remain?',
        options: ['A. 9 birds', 'B. 8 birds', 'C. 1 bird', 'D. 0 birds'],
        answer: 'D',
        explanation: 'None remain! When the shot fires, the other 9 birds fly away in fright. The one shot falls down, and the rest are gone. So no birds remain on the branch.'
    },
    {
        question: '🧠 2, 6, 12, 20, ?, 42. What is the missing number?',
        options: ['A. 28', 'B. 30', 'C. 32', 'D. 36'],
        answer: 'B',
        explanation: 'The pattern is n×(n+1): 1×2=2, 2×3=6, 3×4=12, 4×5=20, 5×6=30, 6×7=42. The missing number is 30.'
    },
    {
        question: '🧠 A hen stands on a rooftop. The wind blows east. Which way does the egg fall?',
        options: ['A. East', 'B. West', 'C. Straight down', 'D. No egg falls'],
        answer: 'D',
        explanation: 'A hen doesn\'t lay eggs while standing on a rooftop! And even if she did, hens don\'t drop eggs while standing — they sit when laying. The wind detail is a decoy.'
    },
    {
        question: '🧠 There are 3 apples. You take 1, then your friend takes 1. How many are left?',
        options: ['A. 0 apples', 'B. 1 apple', 'C. 2 apples', 'D. 3 apples'],
        answer: 'B',
        explanation: '3 apples minus 1 (you) minus 1 (your friend) = 1 apple left. This is straightforward but often answered wrong in a rush.'
    },
    {
        question: '🧠 Which came first — the chicken or the egg?',
        options: ['A. The chicken', 'B. The egg', 'C. Both at the same time', 'D. The question can\'t be answered'],
        answer: 'B',
        explanation: 'Evolutionarily, reptile eggs existed long before modern chickens. The modern chicken (Gallus gallus domesticus) was born from a genetic mutation inside an egg — so the egg came first.'
    },
    {
        question: '🧠 If 1=5, 2=10, 3=15, 4=20, then 5=?',
        options: ['A. 25', 'B. 30', 'C. 1', 'D. 5'],
        answer: 'C',
        explanation: 'Look at the first line: 1=5. That means 5=1! Not 25. This is a trick question because the brain automatically follows the ×5 pattern without noticing the first line already gives the answer.'
    },
    {
        question: '🧠 A car travels 60 km in the first hour and 60 km in the second hour. What is its average speed?',
        options: ['A. 30 km/h', 'B. 60 km/h', 'C. 90 km/h', 'D. 120 km/h'],
        answer: 'B',
        explanation: 'Total distance = 120 km, total time = 2 hours. Average speed = 120÷2 = 60 km/h. This looks easy but many people overthink and miscalculate.'
    }
]

function getQuizRandom() {
    return QUIZ_LIST[Math.floor(Math.random() * QUIZ_LIST.length)]
}

function checkJawaban(inputUser, jawabanBenar) {
    const input = inputUser.trim().toUpperCase().charAt(0)
    return input === jawabanBenar.toUpperCase()
}

module.exports = { getQuizRandom, checkJawaban, QUIZ_LIST }

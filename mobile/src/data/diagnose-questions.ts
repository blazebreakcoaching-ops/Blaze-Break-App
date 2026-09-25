// Ported verbatim from ../../../src/components/DiagnoseSection.tsx:29-242 -
// this is content (the actual assessment), not UI, so it copies 1:1. Any
// wording change here would make mobile and web give genuinely different
// assessments off the same answers, which the scoring on server.ts is not
// designed to tolerate (it scores by question id, not by wording).
export interface DiagnoseQuestion {
  id: string;
  text: string;
  options: { text: string; value: number }[];
}

export const QUESTIONS: DiagnoseQuestion[] = [
  {
    id: 'workload',
    text: 'How often do you feel like your daily workload is physically and mentally impossible to complete?',
    options: [
      { text: 'Rarely — it sits around a comfortable baseline', value: 1 },
      { text: 'Sometimes — but I catch up on weekends', value: 2 },
      { text: 'Most days — I am perpetually behind and sinking', value: 3 },
      { text: 'Every waking hour — it is an endless tidal wave', value: 4 },
    ],
  },
  {
    id: 'boundaries',
    text: 'When someone requests a "quick favour" that encroaches on your focused recovery time, you:',
    options: [
      { text: 'Hold my line. I politely but firmly decline if I am occupied.', value: 1 },
      { text: 'Flinch but accept. I say yes and just absorb the extra stress.', value: 2 },
      { text: 'Accept grudgingly. I say yes but quietly simmer with irritation.', value: 3 },
      { text: 'Panic and prioritise. I drop my own health to solve their problem.', value: 4 },
    ],
  },
  {
    id: 'peoplePleasing',
    text: 'How much of your daily energy is spent "fawning," proving your worth, or managing other people\'s emotional temperatures?',
    options: [
      { text: 'Very little. I operate from my standards, not approval.', value: 1 },
      { text: 'A moderate amount. I prefer keeping the peace.', value: 2 },
      { text: "Significant amount. I feel responsible for everyone's mood.", value: 3 },
      { text: 'All of it. My self-worth is entirely fused with being helpful and perfect.', value: 4 },
    ],
  },
  {
    id: 'guilt',
    text: 'What happens in your nervous system when you attempt to sit still, rest, or do absolutely nothing for an hour?',
    options: [
      { text: 'Baseline stability. I feel peaceful and physically relaxed.', value: 1 },
      { text: 'Mild restlessness. My mind reels off a few pending tasks.', value: 2 },
      { text: 'Intense guilt. I feel lazy, useless, and feel forced to check my phone.', value: 3 },
      { text: 'Full panic/activation. Red alert. I feel physically unsafe doing nothing.', value: 4 },
    ],
  },
  {
    id: 'sleep',
    text: 'Rate the state of your sleep and ability to turn off the "performance narrative" at night:',
    options: [
      { text: 'Acoustic and deep. I sleep soundly and wake restored.', value: 1 },
      { text: 'Wired but tired. I fall asleep exhausted but wake at 3 AM with active chatter.', value: 2 },
      { text: 'Severe neural fatigue. I stare at screens, then lie awake drafting emails.', value: 3 },
      { text: 'Digital paralysis. I sleep 4 hours maximum: my brain never shuts down.', value: 4 },
    ],
  },
  {
    id: 'emotionalOverload',
    text: 'How frequently do you find yourself feeling emotionally cynical, irritable, or completely "flat" (no joy, no spark)?',
    options: [
      { text: 'Rarely. I feel reactive but highly resilient.', value: 1 },
      { text: 'Occasionally. I get cynical under intense deadlines.', value: 2 },
      { text: 'Constantly. I view colleagues with annoyance and feel completely empty.', value: 3 },
      { text: 'I have checked out. I feel like a cold machine going through motions.', value: 4 },
    ],
  },
  {
    id: 'meaning',
    text: 'How connected do you feel to your sense of purpose, versus feeling like you are in "pure survival mode"?',
    options: [
      { text: 'Strongly aligned. I know exactly why I am doing this.', value: 1 },
      { text: 'Fading alignment. The vision is getting buried under administrative tax.', value: 2 },
      { text: 'Completely disconnected. It is entirely a survival run for the paycheck or exit.', value: 3 },
      { text: 'Crisis block. I do not remember what a meaningful activity feels like.', value: 4 },
    ],
  },
  {
    id: 'selfDoubt',
    text: "When you succeed at something significant, what's your internal reaction?",
    options: [
      { text: 'I did the work, and I own it.', value: 1 },
      { text: "I'm pleased, but a part of me wonders if I got lucky.", value: 2 },
      { text: 'I feel a flash of relief that no one "found out" this time.', value: 3 },
      { text: "I immediately start proving myself again — the win doesn't count for long.", value: 4 },
    ],
  },
  {
    id: 'delegationControl',
    text: "When someone else's version of a task doesn't meet your standard, you:",
    options: [
      { text: "Accept it if it meets the actual requirement, even if I'd have done it differently.", value: 1 },
      { text: 'Feel a pull to adjust it, but usually resist.', value: 2 },
      { text: "Redo it myself quietly, telling myself it's faster this way.", value: 3 },
      { text: 'Take the task back entirely rather than risk it being wrong again.', value: 4 },
    ],
  },
  {
    id: 'maskingLoad',
    text: 'How much of your energy at work goes into managing how you come across, separate from the actual work itself?',
    options: [
      { text: "Very little — I don't think about it much.", value: 1 },
      { text: "Some — I adjust a bit depending on who's in the room.", value: 2 },
      { text: "A lot — I'm constantly monitoring and adjusting how I present.", value: 3 },
      { text: "Most of it — by the time I've managed how I seem, there's little energy left for the work.", value: 4 },
    ],
  },
  {
    id: 'caregivingLoad',
    text: "Outside of work, how much does caring for someone else (a child, aging parent, or family member) cut into the time you'd otherwise use to recover?",
    options: [
      { text: "Not at all — I don't have caregiving responsibilities right now.", value: 1 },
      { text: 'Some — it takes a bit of my downtime most weeks.', value: 2 },
      { text: 'Significantly — my recovery time is regularly sacrificed for caregiving.', value: 3 },
      { text: 'Completely — there is no real recovery time; caregiving fills every gap.', value: 4 },
    ],
  },
  {
    id: 'crisisDependency',
    text: 'How do you feel during a genuinely calm, low-urgency stretch at work?',
    options: [
      { text: 'Comfortable — I use it to plan, recharge, or catch up.', value: 1 },
      { text: 'A little restless, but I settle into it.', value: 2 },
      { text: 'Restless enough that I start creating urgency of my own.', value: 3 },
      { text: "Anxious and adrift, like something must be wrong if nothing's on fire.", value: 4 },
    ],
  },
  {
    id: 'emotionalPerformance',
    text: 'In front of colleagues or clients, how much of your real internal state actually shows?',
    options: [
      { text: 'Pretty much what I feel is what shows.', value: 1 },
      { text: 'I keep a professional face on regardless of how I feel underneath.', value: 2 },
      { text: 'I actively perform enthusiasm or ease even when I feel awful.', value: 3 },
      { text: "I've genuinely lost track of what I feel underneath the performance.", value: 4 },
    ],
  },
  {
    id: 'responsibilityCreep',
    text: "When something goes wrong on a team or project that isn't officially yours to fix, you:",
    options: [
      { text: 'Note it, and let the actual owner handle it.', value: 1 },
      { text: 'Feel a pull to step in, but usually resist.', value: 2 },
      { text: 'Quietly take it on because someone has to.', value: 3 },
      { text: 'Immediately absorb it as my problem, regardless of whose job it technically is.', value: 4 },
    ],
  },
];

// The original 7 questions, before two rounds of archetype expansion grew
// the assessment to 14 - see the matching comment in DiagnoseSection.tsx.
export const QUICK_CHECK_IDS = ['workload', 'boundaries', 'peoplePleasing', 'guilt', 'sleep', 'emotionalOverload', 'meaning'];

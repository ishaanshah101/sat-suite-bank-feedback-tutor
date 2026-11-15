// ACT English: rules and playbook.
// Written from ACT's own descriptions of the test (the enhanced ACT, 2025 on) and its official practice
// materials, plus well-known prep guidance. Each rule is one thing a student can learn and reuse.
//
// ACT's reporting categories for English (enhanced ACT): Production of Writing (Topic Development;
// Organization, Unity, and Cohesion), Knowledge of Language, and Conventions of Standard English
// (Sentence Structure and Formation, Punctuation, Usage). Joining clauses, subject-verb and pronoun
// agreement, tense consistency, opening modifiers, parallelism, possessive pronouns, comparisons and
// transitions are already covered by SAT rules listed in SAT_RULES_FOR_ACT_ENGLISH, so they are not repeated.
import type { Rule } from "./rules";
import type { PlaybookEntry } from "./playbook";

const r = String.raw;
void r;

const D = "ACT English" as const;
const PUN = "Punctuation" as const;
const SSF = "Sentence Structure and Formation" as const;
const USE = "Usage" as const;
const KLA = "Knowledge of Language" as const;
const TOD = "Topic Development" as const;
const OUC = "Organization, Unity, and Cohesion" as const;

const base = { section: "english" as const, exams: ["act" as const] };

/** ACT English rules (ACT only). */
export const ACT_ENGLISH_RULES: Rule[] = [
  // ---------------------------------------------------------------- General
  {
    ...base,
    id: "AEN-00",
    domain: "General",
    skill: "General",
    name: "Name what the choices change",
    statement:
      "Read the whole sentence, then compare the four choices to see what changes between them (punctuation, verb form, pronoun, length, or meaning); that difference names the rule being tested.",
    spot_it: "Every ACT English question: an underlined or boxed portion of a passage with four choices, the first often NO CHANGE.",
    test: "Scan the choices top to bottom: only punctuation changes means a boundary or comma rule; only length changes means concision; a verb or pronoun form changes means agreement, tense, or case; different ideas mean read the stem and the paragraph.",
    trap: "Reading only the underlined words; the subject, the earlier tense, or the idea that makes a choice wrong often sits just before or after them.",
    example: {
      wrong: "Choices change only is/are, so judging by ear: 'The list of winners posted near the doors are updated daily.'",
      right: "Choices change only is/are, so find the subject (list): 'The list of winners posted near the doors is updated daily.'",
    },
    tips: [
      "Enhanced ACT: 50 questions in 35 minutes (about 42 seconds each), and 10 of them are unscored field-test items you cannot identify, so answer every question.",
      "Older practice tests: 75 questions in 45 minutes (about 36 seconds each); the rules are the same.",
      "There is no penalty for a wrong answer; never leave a blank.",
    ],
  },

  // ---------------------------------------------------------------- Knowledge of Language
  {
    ...base,
    id: "AEN-01",
    domain: D,
    skill: KLA,
    name: "NO CHANGE is a real answer",
    statement:
      "NO CHANGE is right about as often as any other choice (roughly one question in four), so treat the original as a fourth option and keep it when it breaks no rule and is no longer than needed.",
    spot_it: "The first choice reads NO CHANGE.",
    test: "Name the rule the choices test, check the original against it first, and keep it if it passes; switch only when you can name what is wrong with it.",
    trap: "Assuming the underlined part must contain an error and switching to a choice that is merely different, often longer or more formal.",
    example: {
      wrong: "Original 'The crew finished the roof before the rain came.' Picked: 'The crew finished the roof prior to the arrival of the rain.'",
      right: "Kept NO CHANGE: 'The crew finished the roof before the rain came.'",
    },
    tips: [
      "Counts of published ACT forms put NO CHANGE between about 23 and 38 percent of answers, so never avoid it by habit.",
      "A streak of NO CHANGE answers is not a warning sign; each question stands alone.",
    ],
  },
  {
    ...base,
    id: "AEN-02",
    domain: D,
    skill: KLA,
    name: "Shortest correct choice wins",
    statement:
      "When two or more choices are grammatical and mean the same thing, the shortest one, including OMIT or DELETE, is usually right; the exceptions are a shorter choice that breaks grammar, drops meaning the sentence needs, or ignores a goal the stem names.",
    spot_it: "Choices that grow or shrink in length, or a last choice reading 'OMIT the underlined portion' or 'DELETE the underlined portion'.",
    test: "Try the shortest choice first: read the sentence with it (or with the words removed); if it is grammatical, clear, and loses nothing needed, take it; if not, move to the next shortest.",
    trap: "Choosing OMIT when it leaves a fragment or removes a needed fact or link, or choosing a long choice because it sounds more sophisticated.",
    example: {
      wrong: "The town grew quickly, and as a result of this rapid growth, it built a second school.",
      right: "The town grew quickly, so it built a second school.",
    },
    tips: [
      "OMIT or DELETE is right often enough to test first, but always read the sentence without the words before choosing it.",
      "If the stem asks for detail, description, or a specific example, the longer choice that supplies it beats the shortest.",
    ],
  },
  {
    ...base,
    id: "AEN-03",
    domain: D,
    skill: KLA,
    name: "Say it only once",
    statement:
      "Do not repeat an idea the sentence or the nearby text already states; a word that means the same as another word nearby is redundant and should go.",
    spot_it: "A choice adds a word or phrase whose meaning is already present (annual and every year, return back, past history, first began, combined together).",
    test: "Name the idea the extra words add and look for the same idea elsewhere in the sentence or the one before it; if it is already there, cut it.",
    trap: "A redundant choice sounds emphatic and thorough, so it feels more complete.",
    example: {
      wrong: "The festival, which is held annually, takes place every year in May.",
      right: "The festival takes place every year in May.",
    },
    tips: [
      "Common doubles: advance planning, basic fundamentals, end result, few in number, final outcome, free gift, join together, new innovation, repeat again, true fact, unexpected surprise.",
    ],
  },
  {
    ...base,
    id: "AEN-04",
    domain: D,
    skill: KLA,
    name: "Cut words that do nothing",
    statement:
      "When choices mean the same thing, prefer fewer and plainer words: 'because' over 'due to the fact that', an active verb over a passive one, and a verb over a noun phrase ('decided' over 'made a decision').",
    spot_it: "Choices that say the same thing in different lengths without repeating an idea, often with phrases like 'in order to', 'the fact that', or 'was made by'.",
    test: "Strip each choice to its core subject and verb; if a short choice keeps the meaning and the grammar, the longer ones are padding.",
    trap: "Passive or noun-heavy phrasing ('the decision was made by the council') that sounds official but adds nothing.",
    example: {
      wrong: "The decision to close the park was made by the council due to the fact that funds were low.",
      right: "The council decided to close the park because funds were low.",
    },
    tips: [
      "Swap list: due to the fact that = because; at this point in time = now; in the event that = if; has the ability to = can; for the purpose of = to; in spite of the fact that = although.",
    ],
  },
  {
    ...base,
    id: "AEN-05",
    domain: D,
    skill: KLA,
    name: "Pick the most precise word",
    statement:
      "When the choices are near-synonyms, choose the word whose exact meaning and tone fit the context; vague words (things, stuff, aspects, a lot, good) lose to specific ones.",
    spot_it: "Stems such as 'Which choice most precisely...' or 'most clearly conveys...', or four similar words (said, claimed, admitted, boasted).",
    test: "Predict the meaning the sentence needs from the context, then check each choice's exact sense and whether it is positive, negative, or neutral.",
    trap: "A word close in meaning but with the wrong shade: 'notorious' (famous for something bad) in praise, or 'boasted' where the context is neutral.",
    example: {
      wrong: "The scientist was notorious for her careful research, which earned her several awards.",
      right: "The scientist was renowned for her careful research, which earned her several awards.",
    },
  },
  {
    ...base,
    id: "AEN-06",
    domain: D,
    skill: KLA,
    name: "Match the essay's voice",
    statement:
      "Keep word choice at the same level of formality as the rest of the essay: no slang or chatty phrases in a formal essay, and no stiff, inflated wording in a plain or personal one.",
    spot_it: "Stems such as 'Which choice best maintains the style and tone of the essay?' or choices ranging from casual (super, kind of, a ton of) to grand (exceedingly magnificent).",
    test: "Read a few sentences around the underlined part to hear the essay's voice, then cut any choice that would sound out of place in it.",
    trap: "Slang that matches everyday speech ('totally awesome', 'freaked out') or an over-the-top formal phrase in a plain essay.",
    example: {
      wrong: "The committee reviewed the proposal and decided it was pretty much a no-go.",
      right: "The committee reviewed the proposal and decided to reject it.",
    },
  },

  // ---------------------------------------------------------------- Topic Development
  {
    ...base,
    id: "AEN-07",
    domain: D,
    skill: TOD,
    name: "Add only what serves the focus",
    statement:
      "Add, keep, or delete a sentence by one test: does it support the specific point of this paragraph at this spot? True, interesting information that drifts from that point should go.",
    spot_it: "Stems such as 'At this point, the writer is considering adding the following sentence. Should the writer make this addition here?' or 'Should the writer delete this sentence?'",
    test: "State the paragraph's point in a few words, then read the paragraph with and without the sentence; keep it only if it explains, supports, or links to that point.",
    trap: "A fascinating fact about the same general subject (the city, the person, the animal) that is not about what this paragraph is doing.",
    example: {
      wrong: "In a paragraph about how bees use dances to communicate, adding: 'Honey never spoils, so jars from ancient tombs are still edible.'",
      right: "In a paragraph about how bees use dances to communicate, adding: 'The angle of the dance shows the direction of the food relative to the sun.'",
    },
  },
  {
    ...base,
    id: "AEN-08",
    domain: D,
    skill: TOD,
    name: "Decide, then check the reason",
    statement:
      "On yes-or-no questions, decide yes or no first, then pick the reason that accurately describes what the sentence does; a reason that misdescribes the sentence or the paragraph is wrong even with the right decision.",
    spot_it: "Four choices shaped 'Yes, because...', 'Yes, because...', 'No, because...', 'No, because...'.",
    test: "Eliminate the two choices with the wrong decision, then check each remaining reason against the text: does the sentence really do what the reason claims?",
    trap: "A reason that sounds sensible but is false about the passage, such as claiming the sentence contradicts something it agrees with.",
    example: {
      wrong: "Added sentence explains how the angle of a bee's dance shows direction. Pick: 'No, because it contradicts the claim that bees communicate by dancing.'",
      right: "Same sentence. Pick: 'Yes, because it explains how the dance tells other bees where to find food.'",
    },
  },
  {
    ...base,
    id: "AEN-09",
    domain: D,
    skill: TOD,
    name: "Name what the deletion loses",
    statement:
      "When asked what would be lost if a part were deleted, describe literally what that part does in its spot (a detail, an example, a contrast, a definition), not a grand role it never plays.",
    spot_it: "Stems such as 'If the writer were to delete this sentence, the paragraph would primarily lose:' or 'If the writer deleted the underlined portion, the essay would lose...'.",
    test: "Reread only the part to be deleted, say in a few words what it adds, and pick the choice that says the same thing.",
    trap: "Choices that inflate the part's role ('the essay's main argument') or describe content that is in a different sentence.",
    example: {
      wrong: "'The town sat beside the river, which flooded every spring.' Deleting the which-clause loses: 'an explanation of why the town was founded.'",
      right: "'The town sat beside the river, which flooded every spring.' Deleting the which-clause loses: 'a detail showing why the river was a danger to the town.'",
    },
  },
  {
    ...base,
    id: "AEN-10",
    domain: D,
    skill: TOD,
    name: "Check the essay against the goal",
    statement:
      "For 'Suppose the writer's primary purpose had been to...', compare that goal with what the whole essay actually does; answer yes only if the essay's main focus is that goal, and pick the reason that describes the essay truthfully.",
    spot_it: "A question after a passage: 'Suppose the writer's primary purpose had been to... Would this essay accomplish that purpose?'",
    test: "Summarize the essay in one sentence, then check the goal's key words (a history, a process, a comparison, one person, many examples) against it; a goal broader or narrower than the essay gets No.",
    trap: "Answering yes because the essay mentions the topic once, or picking a reason that misstates what the essay focuses on.",
    example: {
      wrong: "Essay: one woman's restoration of a single lighthouse. Goal: survey the history of lighthouses across the country. Pick: 'Yes, because it describes the lighthouse's history.'",
      right: "Same essay and goal. Pick: 'No, because it focuses on one person's restoration of a single lighthouse.'",
    },
  },
  {
    ...base,
    id: "AEN-11",
    domain: D,
    skill: TOD,
    name: "The stem's goal decides",
    statement:
      "When a stem says 'Given that all the choices are true' or names a goal (the most specific detail, emphasize a danger, set up a contrast), every choice is grammatical, so pick the one that does exactly that job.",
    spot_it: "Stems starting 'Given that all the choices are true, which one...' or 'Which choice most effectively...' followed by a goal.",
    test: "Underline the goal's key words, then ask of each choice: does it do that job, precisely, at this spot? When the goal asks for detail, specific beats general.",
    trap: "A true, well-written choice that does a different job, or a vague one ('it was very interesting') when the goal wants specifics.",
    example: {
      wrong: "Goal: show how crowded the market was. Pick: 'The market was a popular place to shop.'",
      right: "Goal: show how crowded the market was. Pick: 'Shoppers stood shoulder to shoulder in every aisle of the market.'",
    },
  },

  // ---------------------------------------------------------------- Organization, Unity, and Cohesion
  {
    ...base,
    id: "AEN-12",
    domain: D,
    skill: OUC,
    name: "Place sentences by their links",
    statement:
      "A sentence goes where its links point: after anything its pronouns, 'this', 'these', 'also', 'then', or 'the' plus a noun refer back to, and before whatever it introduces.",
    spot_it: "Stems such as 'For the sake of logic and cohesion, Sentence 4 should be placed:' or 'The best placement for this sentence would be:'.",
    test: "Circle the reference words in the sentence being moved (she, this method, these, also, later, the second) and place it right after what they point to; then check that the next sentence still follows.",
    trap: "Placing a sentence by topic alone, so a pronoun or 'also' has nothing to point back to in its new spot.",
    example: {
      wrong: "This method cut the drying time in half. Farmers began spreading the grapes on racks in the sun.",
      right: "Farmers began spreading the grapes on racks in the sun. This method cut the drying time in half.",
    },
  },
  {
    ...base,
    id: "AEN-13",
    domain: D,
    skill: OUC,
    name: "Order by time and logic",
    statement:
      "Paragraphs and sentences in a sequence follow time order or logical order: general before specific, cause before result, events in the order they happened, and a person or thing named before it is referred to.",
    spot_it: "Numbered paragraphs with a question such as 'For the sake of the logic and coherence of the essay, Paragraph 3 should be placed:'.",
    test: "Read the first and last sentences of the paragraph in question and the dates and transitions around it; it belongs where its opening picks up what came just before.",
    trap: "A spot where the topic matches but the timeline or a reference word (afterward, still, the new building) does not.",
    example: {
      wrong: "Paragraph order: the dedication ceremony for the new library, then the fund drive that paid for it.",
      right: "Paragraph order: the fund drive that paid for the new library, then the dedication ceremony.",
    },
  },
  {
    ...base,
    id: "AEN-14",
    domain: D,
    skill: OUC,
    name: "Openings point to what follows",
    statement:
      "An introductory or topic sentence must preview what its paragraph actually discusses, and a transition sentence between paragraphs must connect the last idea of one with the first idea of the next.",
    spot_it: "Stems such as 'Which choice most effectively introduces the paragraph?' or 'Which choice provides the best transition from the previous paragraph to this one?'.",
    test: "Read the paragraph that follows first and name its subject; pick the opener that names that subject; for a transition, the choice must touch both paragraphs.",
    trap: "An opener that fits the essay in general but not this paragraph, or a transition that only looks back at the previous paragraph.",
    example: {
      wrong: "Paragraph about how the bridge was built. Opener: 'Today the bridge carries 40,000 cars a day.'",
      right: "Paragraph about how the bridge was built. Opener: 'Building the bridge took six years and two thousand workers.'",
    },
  },
  {
    ...base,
    id: "AEN-15",
    domain: D,
    skill: OUC,
    name: "Conclusions close the loop",
    statement:
      "A concluding sentence or paragraph wraps up the main idea of its paragraph or essay, often echoing the opening; it does not start a new topic or add a new argument.",
    spot_it: "Stems such as 'Which choice most effectively concludes the paragraph?' or 'Which choice best concludes the essay by referring back to its opening?'.",
    test: "Name the main idea of the paragraph or essay and pick the choice that restates or resolves it; if the stem mentions the opening, the choice must refer back to it.",
    trap: "A dramatic or true choice that brings in a new topic, a new example, or a detail from elsewhere.",
    example: {
      wrong: "Essay that opens with a grandmother planting tomatoes in her garden. Ending: 'Many cities now offer community gardens to residents.'",
      right: "Same essay. Ending: 'Every summer I plant tomatoes in her old beds, just as she did.'",
    },
  },
  {
    ...base,
    id: "AEN-16",
    domain: D,
    skill: OUC,
    name: "No transition can be best",
    statement:
      "If two sentences have no contrast, cause, or example relationship, the right choice is often the one with no transition word; a transition that claims a relationship that is not there is wrong.",
    spot_it: "Transition choices where one version has no transition word, or the last choice is OMIT or DELETE.",
    test: "Name the actual relationship; if it is plain continuation and no transition fits exactly, choose the version without one.",
    trap: "Adding 'however', 'therefore', or 'in other words' because a transition seems expected.",
    example: {
      wrong: "The museum opened in 1902. Therefore, its first exhibit featured local fossils.",
      right: "The museum opened in 1902. Its first exhibit featured local fossils.",
    },
  },

  // ---------------------------------------------------------------- Sentence Structure and Formation
  {
    ...base,
    id: "AEN-17",
    domain: D,
    skill: SSF,
    name: "Find the one that fails",
    statement:
      "In 'NOT acceptable' or 'LEAST acceptable' questions the underlined original is correct and three choices are acceptable alternatives; the answer is the one choice that breaks a rule or changes the meaning.",
    spot_it: "Stems such as 'Which of the following alternatives to the underlined portion would NOT be acceptable?'.",
    test: "Plug each choice into the sentence and mark it yes or no; look for the one that creates an error (a comma splice, a fragment) or switches the relationship (a contrast word where the original shows cause).",
    trap: "Picking the choice you like least instead of the one that is actually wrong, or forgetting that the original is correct.",
    example: {
      wrong: "Original: 'The rain stopped; the game resumed.' Marked 'The rain stopped. The game resumed.' as not acceptable.",
      right: "Same original. Marked 'The rain stopped, the game resumed.' as not acceptable, because it is a comma splice.",
    },
    tips: [
      "Acceptable alternatives usually come as equivalents: period = semicolon = comma plus and; however = nevertheless; because = since; find the odd one out.",
    ],
  },
  {
    ...base,
    id: "AEN-18",
    domain: D,
    skill: SSF,
    name: "One link between two clauses",
    statement:
      "Join two clauses with one linking word, not two: 'although' or 'but', never both; 'because' or 'so', never both.",
    spot_it: "A sentence that opens with although, because, since, though, or while, and choices that add but, so, yet, or and before the second clause.",
    test: "If the first clause starts with a subordinating word, the second clause starts with its own subject right after the comma, with no FANBOYS word.",
    trap: "Doubled links sound natural in speech ('Although it rained, but we played').",
    example: {
      wrong: "Although the trail was steep, but the hikers reached the top by noon.",
      right: "Although the trail was steep, the hikers reached the top by noon.",
    },
  },
  {
    ...base,
    id: "AEN-19",
    domain: D,
    skill: SSF,
    name: "Which and because can fragment",
    statement:
      "Putting which, who, that, because, although, or while in front of a clause makes it dependent, so the sentence still needs a full main clause; a subject followed only by a which-clause is a fragment.",
    spot_it: "Choices that add or remove which, who, or a subordinating word in front of the sentence's main verb.",
    test: "Cover every clause starting with which, who, that, because, or although; what remains must be a full sentence with its own subject and verb.",
    trap: "A long sentence feels complete even when its only verbs sit inside a which-clause.",
    example: {
      wrong: "The lighthouse, which was built in 1871 and still guides ships today.",
      right: "The lighthouse, which was built in 1871, still guides ships today.",
    },
  },
  {
    ...base,
    id: "AEN-20",
    domain: D,
    skill: SSF,
    name: "Describing words beside their target",
    statement:
      "Put a describing word or phrase right next to what it describes; limiting words such as only, nearly, almost, and just go directly before the word they limit.",
    spot_it: "Stems such as 'The best placement for the underlined portion would be:' or choices that move a phrase or a limiting word within the sentence.",
    test: "Ask what the word or phrase describes, move it beside that word, and reread for a silly or changed meaning.",
    trap: "A limiting word placed before the verb that changes the meaning ('almost scored' means no points were scored).",
    example: {
      wrong: "The team almost scored every point in the second half.",
      right: "The team scored almost every point in the second half.",
    },
  },
  {
    ...base,
    id: "AEN-21",
    domain: D,
    skill: SSF,
    name: "Keep the same point of view",
    statement:
      "Keep the same person (one, you, we, they) through a sentence and its paragraph; do not switch from 'one' to 'you' or from 'we' to 'they' mid-thought.",
    spot_it: "Choices that swap you, one, we, they, or he or she, often in advice or general statements.",
    test: "Find the pronoun used earlier in the sentence or paragraph for the same people and match it.",
    trap: "Switching to 'you' because it sounds conversational.",
    example: {
      wrong: "If one wants to grow tomatoes, you should plant them in full sun.",
      right: "If you want to grow tomatoes, you should plant them in full sun.",
    },
  },
  {
    ...base,
    id: "AEN-22",
    domain: D,
    skill: SSF,
    name: "Subjects must fit their verbs",
    statement:
      "A subject must be able to do or be what its verb says: write 'the reason is that', not 'the reason is because', and do not define something with 'is when' or 'is where'.",
    spot_it: "Sentences with 'the reason ... is', a definition ('X is when...'), or an abstract subject paired with an action verb.",
    test: "Read the bare subject and verb together (the reason is because, a drought is when); if the pair is illogical, choose the version that uses 'that' or names the right subject.",
    trap: "'The reason is because' and 'is when' are common in speech.",
    example: {
      wrong: "The reason the game was canceled is because the field flooded.",
      right: "The reason the game was canceled is that the field flooded.",
    },
  },

  // ---------------------------------------------------------------- Usage
  {
    ...base,
    id: "AEN-23",
    domain: D,
    skill: USE,
    name: "Who does it, whom receives it",
    statement:
      "Use who (and whoever) for the one doing the action, where 'he' would fit; use whom (and whomever) for the one receiving it or after a preposition, where 'him' would fit.",
    spot_it: "Choices that swap who, whom, whoever, whomever, or whose.",
    test: "Take the who-clause alone and answer it with he or him: 'he' means who, 'him' means whom; the pronoun's job inside its own clause decides, not the word before it.",
    trap: "'Whom' after a preposition or verb when the pronoun is really the subject of its own clause ('give it to whoever arrives first').",
    example: {
      wrong: "The coach praised the player whom scored the winning goal.",
      right: "The coach praised the player who scored the winning goal.",
    },
    tips: ["'To whom did you write?' (to him). 'Give the prize to whoever finishes first' (whoever is the subject of finishes)."],
  },
  {
    ...base,
    id: "AEN-24",
    domain: D,
    skill: USE,
    name: "Cover the other noun",
    statement:
      "Use I, he, she, we, and they as subjects and me, him, her, us, and them as objects, including after between, for, to, and with; in a pair, drop the other person to hear the right form.",
    spot_it: "A pronoun joined to a noun by 'and' (Maria and I, Maria and me), or a pronoun after than, as, between, or for.",
    test: "Cover the other noun and read the pronoun alone ('gave it to me', 'I went'); after than or as, finish the clause in your head ('taller than she is').",
    trap: "'Between you and I' and 'Maria and myself' sound polite but are wrong; 'myself' needs an 'I' earlier in the same clause.",
    example: {
      wrong: "The coach gave the award to Maria and I.",
      right: "The coach gave the award to Maria and me.",
    },
  },
  {
    ...base,
    id: "AEN-25",
    domain: D,
    skill: USE,
    name: "Every pronoun needs a noun",
    statement:
      "A pronoun (it, this, they, which) must point to one specific noun that is actually in the text; if there is none, or two could fit, use the noun instead of the pronoun.",
    spot_it: "Choices that offer a pronoun versus a specific noun (it / the report; this / this change; they / the officials).",
    test: "Draw an arrow from the pronoun to its noun; if there is no noun, or two nouns of the same number could fit, pick the choice that names it.",
    trap: "'They' with no group named ('At the clinic, they said...'), or 'she' after two women have been mentioned.",
    example: {
      wrong: "When the mayor met the director, she announced the new budget.",
      right: "When the mayor met the director, the director announced the new budget.",
    },
  },
  {
    ...base,
    id: "AEN-26",
    domain: D,
    skill: USE,
    name: "Find a subject that comes late",
    statement:
      "In sentences that open with 'there', 'here', or a place phrase ('Among the ruins lie...'), the subject comes after the verb, so find it there before choosing singular or plural.",
    spot_it: "A sentence starting with There, Here, or a prepositional phrase, followed by a verb choice (is/are, lies/lie, was/were).",
    test: "Flip the sentence into normal order ('two coins lie among the ruins') and check agreement.",
    trap: "Matching the verb to the noun in the opening phrase ('the ruins') instead of the real subject after the verb.",
    example: {
      wrong: "Among the ruins lies two ancient coins.",
      right: "Among the ruins lie two ancient coins.",
    },
    tips: ["'There is' goes with one thing and 'there are' with several: 'There are many reasons', never 'There is many reasons'."],
  },
  {
    ...base,
    id: "AEN-27",
    domain: D,
    skill: USE,
    name: "Have and had need participles",
    statement:
      "After has, have, had, or would have, use the past participle (gone, run, written, swum, chosen, seen, taken), and always write 'would have', 'could have', or 'should have', never 'would of'.",
    spot_it: "Choices that swap went/gone, ran/run, wrote/written, swam/swum, or 'would of'/'would have'.",
    test: "If a form of have comes right before the verb, the verb must be the participle; with no have, the simple past stands alone ('they went', 'they have gone').",
    trap: "'Had went' and 'had ran' sound natural in casual speech, and 'would of' is how 'would've' sounds.",
    example: {
      wrong: "By noon, the team had already ran four miles and would of kept going.",
      right: "By noon, the team had already run four miles and would have kept going.",
    },
    tips: [
      "Past / participle: went / gone, ran / run, saw / seen, did / done, began / begun, swam / swum, wrote / written, chose / chosen, took / taken, rode / ridden, drank / drunk, sang / sung, sprang / sprung, froze / frozen, broke / broken.",
    ],
  },
  {
    ...base,
    id: "AEN-28",
    domain: D,
    skill: USE,
    name: "Lie rests, lay places",
    statement:
      "Lie (lay, lain, lying) means to rest and takes no object; lay (laid, laid, laying) means to put something down and needs an object; rise/raise and sit/set split the same way.",
    spot_it: "Choices among lie, lay, laid, lain, lying, laying, rise, raise, sit, or set.",
    test: "Ask whether something is being put or lifted: with an object (laid the book down, raised the flag), use lay, raise, or set; without one, use lie, rise, or sit, and remember the past tense of lie is lay.",
    trap: "'Laid on the couch' for resting, and 'lay the book' confused with the past of lie.",
    example: {
      wrong: "Yesterday the dog laid in the sun for hours.",
      right: "Yesterday the dog lay in the sun for hours.",
    },
  },
  {
    ...base,
    id: "AEN-29",
    domain: D,
    skill: USE,
    name: "If-clauses never take would",
    statement:
      "In an if-clause about something that did not happen, use had plus the participle ('If she had known') and put would have in the other clause; for an unreal present, use were ('If I were taller').",
    spot_it: "A sentence with if, wish, or as if, and choices that put would or would have in the if-clause, or swap was and were.",
    test: "Check the clause that starts with if (or follows wish): it should not contain would; the result clause gets would or would have.",
    trap: "'If he would have left earlier, he would have caught the bus' doubles the would.",
    example: {
      wrong: "If the crew would have checked the forecast, they would have stayed in port.",
      right: "If the crew had checked the forecast, they would have stayed in port.",
    },
  },
  {
    ...base,
    id: "AEN-30",
    domain: D,
    skill: USE,
    name: "Adverbs describe actions",
    statement:
      "Use an adjective to describe a noun and an adverb (usually -ly) to describe a verb, an adjective, or another adverb; well is the adverb for good, and after linking verbs (be, seem, feel, look, smell) use the adjective.",
    spot_it: "Choices that swap quick/quickly, real/really, good/well, careful/carefully, or bad/badly.",
    test: "Find the word being described: a noun takes the adjective; an action verb, an adjective, or an adverb takes the adverb.",
    trap: "Dropping the -ly because it sounds casual ('did real good'), or adding -ly after a linking verb ('feels badly').",
    example: {
      wrong: "The new engine runs quiet and remarkable smooth.",
      right: "The new engine runs quietly and remarkably smoothly.",
    },
  },
  {
    ...base,
    id: "AEN-31",
    domain: D,
    skill: USE,
    name: "Idioms take fixed prepositions",
    statement:
      "Many words take one set preposition or verb form (capable of, responsible for, comply with, interested in, focus on, insist on going, decide to go), and only the standard pairing is correct.",
    spot_it: "Choices that differ only in the preposition, or in a to-verb versus an -ing form after the same word.",
    test: "Say the key word with each option in a short sentence of your own; keep the standard pairing, and check every idiom in the sentence, not just the first.",
    trap: "Choices that blend two idioms ('capable to', 'responsible of') because each piece is common on its own.",
    example: {
      wrong: "The committee was responsible of planning the event and capable to finish on time.",
      right: "The committee was responsible for planning the event and capable of finishing on time.",
    },
    tips: [
      "Common pairs: according to, approve of, aware of, comply with, consistent with, contrary to, credit for, depend on, discriminate against, opposed to, prior to, rely on, similar to, succeed in.",
      "Between is for two, among for three or more; amount is for things you cannot count, number for things you can.",
    ],
  },
  {
    ...base,
    id: "AEN-32",
    domain: D,
    skill: USE,
    name: "Sound-alike words",
    statement:
      "Words that sound alike are tested on meaning: affect (verb, to influence) and effect (noun, a result); than (comparison) and then (time); accept and except; lose and loose; principal and principle; complement and compliment.",
    spot_it: "Choices that are homophones or near-homophones.",
    test: "Put the definition in place of the word (to influence, a result, at that time, compared with) and keep the word whose meaning fits.",
    trap: "Both words are real and correctly spelled, so the sentence looks fine at a glance.",
    example: {
      wrong: "The storm had a greater affect on the coast then on the inland towns.",
      right: "The storm had a greater effect on the coast than on the inland towns.",
    },
    tips: [
      "Also tested: its/it's, their/there/they're, whose/who's, your/you're, to/too/two, cite/site/sight, allude/elude, emigrate/immigrate, precede/proceed, weather/whether.",
    ],
  },
  {
    ...base,
    id: "AEN-33",
    domain: D,
    skill: USE,
    name: "One negative per idea",
    statement:
      "Use only one negative word per idea: hardly, scarcely, and barely already count as negatives, so they do not pair with not, no, or never.",
    spot_it: "Choices containing hardly, scarcely, barely, nothing, or no one near not or never.",
    test: "Count the negative words in the clause; if there are two, remove one.",
    trap: "'Couldn't hardly' and 'didn't have no' sound like emphasis.",
    example: {
      wrong: "The hikers couldn't hardly see the trail in the fog.",
      right: "The hikers could hardly see the trail in the fog.",
    },
  },

  // ---------------------------------------------------------------- Punctuation
  {
    ...base,
    id: "AEN-34",
    domain: D,
    skill: PUN,
    name: "No comma before a second verb",
    statement:
      "When and, but, or or joins two verbs that share one subject, use no comma; the comma goes before the conjunction only when a new subject and verb follow it.",
    spot_it: "One subject doing two actions joined by and or but, with a comma option before the conjunction.",
    test: "Look right after the and or but: if a subject (she, the team) comes next, keep the comma; if a verb comes next, drop it.",
    trap: "A long first action makes a comma before 'and' feel natural.",
    example: {
      wrong: "The volunteers cleaned the beach, and planted dune grass.",
      right: "The volunteers cleaned the beach and planted dune grass.",
    },
  },
  {
    ...base,
    id: "AEN-35",
    domain: D,
    skill: PUN,
    name: "Comma before the last item",
    statement:
      "In a list of three or more items, put a comma after every item except the last, including before the final and or or; a list of two takes no comma.",
    spot_it: "A list of three or more nouns, verbs, or phrases, with choices that add or drop commas around the final and.",
    test: "Count the items: with three or more, a comma follows each item up to the and; with exactly two, no comma; never a comma after the and or after the last item.",
    trap: "A comma after 'and' ('and, a flashlight'), a comma after the last item before the verb, or a comma in a list of just two.",
    example: {
      wrong: "The kit includes a map, a compass and, a flashlight.",
      right: "The kit includes a map, a compass, and a flashlight.",
    },
    tips: ["ACT passages use the comma before 'and' in lists, so a choice that keeps that pattern matches the passage's style."],
  },
  {
    ...base,
    id: "AEN-36",
    domain: D,
    skill: PUN,
    name: "Every comma needs a reason",
    statement:
      "Every comma must do a job (join two sentences with FANBOYS, follow an introduction, separate list items or equal adjectives, or set off extra information as a pair); if a comma does none of these, delete it.",
    spot_it: "Choices that differ only in where or whether commas appear, often including one with no commas.",
    test: "Name the job of each comma; if you cannot, remove it. Usual no-comma spots: before or inside a prepositional phrase, between an adjective and its noun, right after such as, and before a final because-clause.",
    trap: "Commas placed wherever a reader might pause, especially after a long subject or in front of a prepositional phrase.",
    example: {
      wrong: "Hundreds of, monarch butterflies rest, in the old oak grove each fall.",
      right: "Hundreds of monarch butterflies rest in the old oak grove each fall.",
    },
  },
  {
    ...base,
    id: "AEN-37",
    domain: D,
    skill: PUN,
    name: "Apostrophes mark owners only",
    statement:
      "Plain plurals never take an apostrophe; to show ownership, add 's to a singular noun or to a plural that does not end in s (children's, women's), and add only an apostrophe to a plural that ends in s (the farmers' market).",
    spot_it: "Choices that move or remove an apostrophe on a noun (artists, artist's, artists').",
    test: "Ask whether the noun owns the next word; if not, no apostrophe; if so, write the plain singular or plural first, then add 's, or just ' when it already ends in s.",
    trap: "Apostrophes on plurals that own nothing ('the artist's displayed'), and childrens' or womens'.",
    example: {
      wrong: "The artist's displayed their work at the childrens' museum.",
      right: "The artists displayed their work at the children's museum.",
    },
  },
  {
    ...base,
    id: "AEN-38",
    domain: D,
    skill: PUN,
    name: "Commas in dates and places",
    statement:
      "In a full date or a city followed by its state or country, the year or the state is set off by commas on both sides when the sentence continues ('On July 20, 1969, astronauts...'; 'Austin, Texas, is...').",
    spot_it: "A month-day-year date or a city plus state or country in the middle of a sentence.",
    test: "Check for a comma after the day and after the year, or after the city and after the state, when more of the sentence follows; a month and year alone ('July 1969') need no comma.",
    trap: "Dropping the comma after the year or the state, which leaves half a pair.",
    example: {
      wrong: "The team moved to Austin, Texas in 2010.",
      right: "The team moved to Austin, Texas, in 2010.",
    },
  },
];

/** Existing SAT rule ids that also decide ACT English questions (same rule, same wording). */
export const SAT_RULES_FOR_ACT_ENGLISH: string[] = [
  // Joining clauses and punctuation
  "BND-01",
  "BND-02",
  "BND-03",
  "BND-04",
  "BND-05",
  "BND-06",
  "BND-07",
  "BND-08",
  "BND-09",
  "BND-10",
  "BND-11",
  "BND-12",
  "BND-13",
  // Agreement, tense, modifiers, parallelism, possessives, comparisons, idiom pairs, verb forms
  "FSS-01",
  "FSS-02",
  "FSS-03",
  "FSS-04",
  "FSS-05",
  "FSS-06",
  "FSS-07",
  "FSS-08",
  "FSS-09",
  "FSS-10",
  "FSS-11",
  // Transitions
  "TRN-01",
  "TRN-02",
  "TRN-03",
  // Answer-choice discipline that holds for ACT rhetoric questions
  "GEN-02",
  "GEN-03",
];

/** Strategy for every ACT English question. */
export const ACT_ENGLISH_GENERAL_PLAYBOOK: PlaybookEntry = {
  route: [
    "Read the whole sentence, not just the underlined words; for any question about adding, deleting, placing, or introducing, read the whole paragraph.",
    "Compare the four choices before judging them: what changes (punctuation, verb form, pronoun, length, meaning) names the rule being tested.",
    "Read the question stem whenever there is one; most enhanced-ACT items have one, and a stated goal ('Given that all the choices are true...') outranks everything else.",
    "NO CHANGE is right roughly one time in four; check the original first and keep it if it breaks no rule.",
    "Among choices that are grammatical and mean the same thing, take the shortest, and test OMIT or DELETE first when it is offered.",
    "Answer questions about the passage as a whole (paragraph order, the writer's purpose) after reading the entire passage.",
    "Pacing: the enhanced ACT gives 35 minutes for 50 questions, about 42 seconds each (10 are unscored field-test items you cannot spot); older practice tests give 45 minutes for 75, about 36 seconds each. There is no guessing penalty, so fill in every answer.",
  ],
  traps: [
    "A choice that fixes the original error but adds a new one (fixes agreement and creates a comma splice).",
    "Longer, more formal, or passive wording that sounds sophisticated but only adds words.",
    "True, interesting information that is off the paragraph's focus.",
    "A yes-or-no answer with the right decision but a reason that misdescribes the passage.",
    "Commas placed where a reader would pause rather than where a rule requires one.",
    "The shortest choice when it creates a fragment or drops meaning the sentence needs.",
  ],
  lists: [
    "FANBOYS (the only words that join two full sentences after a comma): for, and, nor, but, or, yet, so.",
    "Subordinating words (make a clause dependent): although, because, since, while, when, if, unless, until, whereas, even though.",
    "Transition families: contrast (however, nevertheless, on the other hand, instead); addition (also, furthermore, moreover, in addition); cause and effect (therefore, thus, consequently, as a result); example (for example, for instance); restatement (in other words, that is); sequence (then, later, finally, meanwhile); emphasis (indeed, in fact).",
    "Sound-alikes: affect/effect, than/then, accept/except, its/it's, their/there/they're, whose/who's, your/you're, lose/loose, principal/principle, complement/compliment.",
    "Stem patterns: 'NO CHANGE', 'OMIT/DELETE the underlined portion', 'Which choice would NOT be acceptable?', 'Should the writer make this addition here?', 'If the writer were to delete..., the paragraph would primarily lose:', 'Sentence 4 should be placed:', 'Suppose the writer's primary purpose had been to...'.",
  ],
  mixups: [
    "The shortest answer is not always right: it loses when it breaks grammar, drops needed meaning, or ignores a goal the stem names.",
    "NO CHANGE is not a trap answer; it is right about as often as any other letter.",
    "A comma does not go wherever you would pause in speech; every comma needs a rule.",
    "A period and a semicolon are interchangeable between two full sentences on the ACT, just as on the SAT.",
    "Enhanced-ACT timing is about 42 seconds per question, not the 36 seconds of the older 75-question test.",
  ],
};

/** Strategy per ACT skill in this section. */
export const ACT_ENGLISH_PLAYBOOK: Record<string, PlaybookEntry> = {
  Punctuation: {
    route: [
      "Cover the punctuation and ask whether each side is a complete sentence; two full sentences need a period, a semicolon, a comma plus FANBOYS, a colon, or a dash.",
      "Name the job of every comma in the choice; a comma with no job is the error.",
      "Extra information takes a matching pair (two commas, two dashes, or two parentheses); information that says which one takes no punctuation.",
      "When the choices differ only in punctuation, the version with the least punctuation that is still correct wins more often than expected.",
      "Apostrophes: decide plural or owner first, then singular or plural owner.",
    ],
    traps: [
      "A comma between a subject and its verb, or between a verb and its object, after a long subject.",
      "A comma before 'and' when no new subject follows (two verbs, one subject).",
      "One comma where a pair is needed, or a comma paired with a dash.",
      "A colon or semicolon after 'such as', 'including', or a verb.",
      "An apostrophe on a plain plural.",
    ],
    lists: [
      "Comma jobs: comma plus FANBOYS between sentences; after an introductory phrase or clause; between list items (including before the final and); between equal adjectives; a pair around extra information; dates and places (July 20, 1969, / Austin, Texas,).",
      "No-comma spots: subject and verb; verb and object; before or inside a prepositional phrase; between an adjective and its noun; right after such as or including; before a that-clause; before a final because-clause; before and joining two verbs.",
    ],
    mixups: [
      "A single dash works like a colon (after a complete sentence); two dashes work like a pair of commas.",
      "'However' between two sentences needs a semicolon or a period before it; inside one clause it takes commas on both sides.",
    ],
  },
  "Sentence Structure and Formation": {
    route: [
      "Find the main subject and its conjugated verb; cover every which, who, because, or although clause and check that a full sentence remains.",
      "Check the joins: two full sentences need a period, a semicolon, or a comma plus FANBOYS; one linking word per joint (never 'although ... but').",
      "For an opening phrase ending in a comma, the noun right after the comma must be the one doing that action.",
      "For 'best placement' questions, move the phrase or limiting word next to what it describes.",
      "For NOT acceptable questions, the original is correct; mark each alternative yes or no and pick the single no.",
      "Keep lists parallel and the point of view (one, you, we) and tense the same as the surrounding sentences.",
    ],
    traps: [
      "A comma splice that looks fine because the clauses are short and related.",
      "A fragment hidden inside a long sentence whose only verbs sit in a which-clause or an -ing phrase.",
      "Doubled linking words ('Because ..., so ...').",
      "A possessive after an opening modifier ('Walking home, Maya's phone rang') that still leaves it dangling.",
      "'The reason is because' and 'is when' definitions.",
    ],
    lists: [
      "Equivalent joins for NOT acceptable questions: period = semicolon = comma plus and/but; Although X, Y = X, but Y; because = since = as.",
    ],
    mixups: [
      "An -ing verb alone is never a sentence's main verb ('The team, having trained all winter.' is a fragment).",
      "Shorter does not mean a run-on is fixed: a comma alone between two sentences is still a splice.",
    ],
  },
  Usage: {
    route: [
      "Name the word type that changes across the choices: verb form, pronoun, adjective or adverb, preposition, or a sound-alike word.",
      "Verbs: find the real subject (it may come after the verb), then check tense against nearby sentences and use the participle after has, have, had, or would have.",
      "Pronouns: point each one at a single noun, match number, and pick case by the pronoun's job (cover the other noun; he means who, him means whom).",
      "Modifiers: adjectives describe nouns, adverbs describe verbs, adjectives, and adverbs; use -er for two, -est for three or more.",
      "Idioms and sound-alikes: say the phrase in your own short sentence, or replace the word with its definition.",
    ],
    traps: [
      "The noun nearest the verb that is not its subject ('The box of letters were').",
      "'Between you and I', 'Maria and myself', and 'whom' used as a subject.",
      "'Had went', 'had ran', 'would of', and 'If he would have known'.",
      "'Laid' for resting, 'real good' for really well, and doubled comparisons ('more faster').",
      "A blended idiom ('capable to', 'responsible of').",
    ],
    lists: [
      "Subject pronouns: I, he, she, we, they, who, whoever. Object pronouns: me, him, her, us, them, whom, whomever.",
      "Irregular verbs (past / participle): went / gone, ran / run, saw / seen, did / done, began / begun, swam / swum, wrote / written, chose / chosen, took / taken, lay / lain (rest), laid / laid (put).",
      "Always singular: each, every, either, neither, everyone, anyone, a gerund subject, collective nouns. Always plural: both, few, many, several.",
      "Idioms: capable of, consistent with, comply with, depend on, focus on, interested in, opposed to, prior to, responsible for, similar to.",
    ],
    mixups: [
      "A company, team, or committee is one thing: it and its, not they and their.",
      "Lie means rest and its past tense is lay; lay means put and its past tense is laid.",
      "Hardly, scarcely, and barely are already negative, so 'couldn't hardly' is a double negative.",
    ],
  },
  "Knowledge of Language": {
    route: [
      "If the choices say the same thing at different lengths, try the shortest (or OMIT) first and keep it if the sentence still works and means the same.",
      "Look for an idea the sentence already states; any choice that repeats it is redundant.",
      "For word-choice questions, predict the meaning the context needs, then pick the word with that exact sense and tone.",
      "For style and tone questions, match the formality of the surrounding sentences: no slang in a formal essay, no inflated wording in a plain one.",
      "Prefer active verbs and verbs over noun phrases when the meaning is the same.",
    ],
    traps: [
      "Doubled meanings: annual and every year, return back, past history, first began.",
      "Padded phrases: due to the fact that, in order to, at this point in time, the fact that.",
      "A near-synonym with the wrong connotation (notorious for renowned).",
      "Slang or chatty phrases that sound natural in speech.",
      "OMIT when deleting the words drops meaning the sentence needs.",
    ],
    lists: [
      "Wordy to concise: due to the fact that = because; in the event that = if; has the ability to = can; at this point in time = now; for the purpose of = to; in spite of the fact that = although.",
      "Redundant pairs: advance planning, basic fundamentals, end result, final outcome, free gift, join together, new innovation, past history, repeat again, return back, true fact.",
    ],
    mixups: [
      "Concise does not mean vague: a short choice that loses a needed detail is wrong.",
      "A fancier word is not a better word; the ACT rewards the clear, exact one.",
    ],
  },
  "Topic Development": {
    route: [
      "Read the stem's goal and underline its key words; on these questions every choice is grammatical, so grammar never decides.",
      "State the paragraph's specific point in a few words before judging any added or deleted sentence.",
      "Yes or no questions: decide yes or no from relevance, then check that the reason truthfully describes the sentence and the paragraph.",
      "'Would primarily lose' questions: say literally what the deleted words add (a detail, an example, a contrast) and match it.",
      "Writer's-purpose questions: summarize the whole essay in one sentence and compare it with the stated goal; a goal broader or narrower than the essay gets No.",
      "When the goal asks for detail, illustration, or emphasis, the most specific choice that does that job wins, even if it is longer.",
    ],
    traps: [
      "A true and interesting fact about the general subject that does not serve this paragraph's point.",
      "The right yes or no paired with a reason that misstates the passage.",
      "Inflating what a deleted phrase does ('the main argument of the essay').",
      "Answering yes to a writer's-goal question because the essay mentions the topic once.",
      "A vague choice when the stem asks for specific detail.",
    ],
    lists: [
      "Stem patterns: 'Should the writer make this addition here?'; 'Should the writer delete this sentence?'; 'If the writer were to delete..., the paragraph would primarily lose:'; 'Given that all the choices are true, which one...'; 'Suppose the writer's primary purpose had been to...'.",
    ],
    mixups: [
      "Relevant means relevant to this paragraph's point, not to the essay's general subject.",
      "Concision breaks ties only between choices that both meet the stated goal.",
    ],
  },
  "Organization, Unity, and Cohesion": {
    route: [
      "For sentence placement, circle the reference words in the sentence (this, these, she, also, then, the second) and place it right after what they point to.",
      "For paragraph order, read each paragraph's first and last sentences and follow the timeline and the transitions.",
      "For transitions, label the relationship between the two sentences before reading the choices; if there is no special relationship, the choice with no transition is often right.",
      "For an introduction or topic sentence, read what follows first and pick the opener that names that subject; a transition sentence must touch both paragraphs.",
      "For a conclusion, pick the choice that wraps up the main idea or echoes the opening when the stem asks for it.",
    ],
    traps: [
      "A placement that matches the topic but leaves a pronoun or 'also' with nothing to refer to.",
      "Two transitions from the same family (however and nevertheless), which cannot both be right.",
      "A transition that claims cause or contrast that is not there.",
      "An opener that fits the essay in general but not this paragraph.",
      "A conclusion that adds a new topic or example.",
    ],
    lists: [
      "Reference clues for placement: pronouns (he, she, it, they), demonstratives (this, these, such), sequence words (first, then, later, finally), addition words (also, another, too), and 'the' before a noun already introduced.",
    ],
    mixups: [
      "'Still' at the start of a sentence means 'even so', not 'continuing'.",
      "A transition is not required between every pair of sentences.",
    ],
  },
};

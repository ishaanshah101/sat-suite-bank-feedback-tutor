// ACT Reading: rules and playbook.
// Written from ACT's own descriptions of the test (the enhanced ACT, 2025 on) and its official practice
// materials, plus well-known prep guidance. Each rule is one thing a student can learn and reuse.
//
// Test facts used below:
// - Enhanced ACT (national online tests from April 2025, paper from September 2025): Reading is 36 questions
//   in 40 minutes (about 67 seconds a question), four shorter passages of about 9 questions each. Some
//   questions are unscored field-test items that look exactly like the rest. Passages come as a single
//   passage, a pair of shorter passages (Passage A and Passage B), or a passage with a graph, table or
//   figure (visual and quantitative information). Reporting categories: Key Ideas and Details 44 to 52%,
//   Craft and Structure 26 to 33%, Integration of Knowledge and Ideas 19 to 26%. The composite is the
//   average of English, Math and Reading.
// - Legacy ACT (still in older practice tests): 40 questions in 35 minutes (about 53 seconds a question),
//   four passages of 10 questions, usually in the order literary narrative or prose fiction, social science,
//   humanities, natural science; one of the four is a pair of short passages, and since 2021 one passage may
//   carry a graph, figure or table. Categories: Key Ideas and Details 52 to 60%, Craft and Structure 25 to
//   30%, Integration of Knowledge and Ideas 13 to 23%.
// - No penalty for wrong answers on either version.
import type { Rule } from "./rules";
import type { PlaybookEntry } from "./playbook";

const r = String.raw;
void r;

const KID = "Key Ideas and Details" as const;
const CRAFT = "Author's Craft and Structure" as const;
const IKI = "Integration of Knowledge and Ideas" as const;

const base = { section: "reading" as const, exams: ["act" as const] };

/** ACT Reading rules (ACT only). */
export const ACT_READING_RULES: Rule[] = [
  // ---------------------------------------------------------------- General (every ACT Reading question)
  {
    ...base,
    id: "ARD-00",
    domain: "General",
    skill: "General",
    name: "Prove it from the passage",
    statement:
      "Every ACT Reading answer is stated or nearly stated in the passage, so the right choice is the one you can point to in specific lines, not the one that sounds smart or true in real life.",
    spot_it: "Any ACT Reading question, especially one where two choices both seem reasonable.",
    test: "For your pick, find the lines that prove it; if you cannot put a finger on them, eliminate it and test the next choice.",
    trap: "A choice that matches outside knowledge or common sense but is never said in the passage.",
    example: {
      wrong: "Passage says the bridge took six years to build. Pick: 'The bridge was expensive' (likely true, never stated).",
      right: "Passage says the bridge took six years to build. Pick: 'Construction of the bridge lasted several years.'",
    },
  },
  {
    ...base,
    id: "ARD-01",
    domain: "General",
    skill: "General",
    name: "Budget about ten minutes a passage",
    statement:
      "Split the time evenly by passage (about 10 minutes each on the enhanced ACT, about 8 minutes 45 seconds on the older 40-question test), start with the passage type you read best, and fill in every bubble because wrong answers cost nothing.",
    spot_it: "Timing and order decisions: which passage to start with, when to move on, what to do with a hard question.",
    test: "Check the clock after each passage; if you are more than a minute behind, guess on the slowest remaining question in that set and move on.",
    trap: "Spending four minutes on one hard question and leaving a whole passage, with nine or ten easier points, unread.",
    example: {
      wrong: "Stuck on a paired-passage question at minute 30, the student keeps rereading and never reaches the last passage.",
      right: "Stuck at minute 30, the student guesses, marks it, finishes the last passage, then returns if time remains.",
    },
  },
  {
    ...base,
    id: "ARD-02",
    domain: "General",
    skill: "General",
    name: "Map first, line questions first",
    statement:
      "Read the passage once for its map (the gist of each paragraph and where the author's view shows), then answer questions that point to specific lines or paragraphs before the big-picture questions about the whole passage.",
    spot_it: "A fresh passage with a mix of questions: some cite lines or a paragraph, some ask about the passage as a whole.",
    test: "Jot a three- to five-word gist next to each paragraph; use those notes to find details fast and to answer main idea questions last.",
    trap: "Reading every sentence slowly to memorize details, then rereading anyway because the questions ask for specifics.",
    example: {
      wrong: "Answer question 1, 'The main purpose of the passage is to', before working any of the line questions.",
      right: "Answer the line and paragraph questions first; by then the main purpose is obvious, so do question 1 last.",
    },
  },
  {
    ...base,
    id: "ARD-03",
    domain: "General",
    skill: "General",
    name: "EXCEPT questions: find the odd one",
    statement:
      "For EXCEPT, NOT or LEAST questions, three choices are supported by the passage and the answer is the one that is not, so mark each choice true or false and pick the lone false.",
    spot_it: "A capitalized EXCEPT, NOT or LEAST in the question stem.",
    test: "Write T or F beside each choice after checking it against the passage; the single F is the answer.",
    trap: "Forgetting the reversal halfway through and picking the first choice that the passage supports.",
    example: {
      wrong: "'The passage mentions all of the following as causes EXCEPT' and the student picks a cause found in paragraph 2.",
      right: "Three choices are found as causes in paragraphs 2 and 3; the fourth never appears, so it is the answer.",
    },
  },
  {
    ...base,
    id: "ARD-04",
    domain: "General",
    skill: "General",
    name: "Right fact, wrong part",
    statement:
      "When a question names lines, a paragraph or a moment in the story, the answer comes from that spot, so a choice that is true somewhere else in the passage is still wrong.",
    spot_it: "Questions that say 'in lines 30 to 35', 'in the third paragraph', 'at the beginning of the passage', or 'when the narrator first arrives'.",
    test: "Read the cited lines plus a sentence before and after; the right choice paraphrases that zone, and a choice that only matches another paragraph is out.",
    trap: "A choice copied from a different paragraph that the student remembers clearly, so it feels familiar and correct.",
    example: {
      wrong: "Question asks how the narrator feels on arriving in the city (paragraph 1, uneasy). Pick: 'proud', which is how she feels at the end.",
      right: "Question asks how the narrator feels on arriving in the city. Pick: 'uneasy and out of place', from paragraph 1.",
    },
  },

  // ---------------------------------------------------------------- Key Ideas and Details
  {
    ...base,
    id: "ARD-05",
    domain: "ACT Reading",
    skill: KID,
    name: "Hunt details with a keyword",
    statement:
      "When a detail question gives no line numbers, pick its most searchable word (a name, number, date, italic term or unusual noun), scan for it, and read the sentences around it.",
    spot_it: "'According to the passage' or 'the passage states that' with no line or paragraph reference.",
    test: "Use your paragraph map to guess where the keyword lives, scan only that area, then paraphrase the sentence before checking the choices.",
    trap: "Choosing from memory a choice that reuses the passage's words but changes who did what or how much.",
    example: {
      wrong: "Question: when did the observatory open? From memory, pick 1962 (the year the telescope was ordered).",
      right: "Scan for 'observatory' and 'opened': the sentence says it opened in 1968, three years after construction began.",
    },
  },
  {
    ...base,
    id: "ARD-06",
    domain: "ACT Reading",
    skill: KID,
    name: "Match the scope asked",
    statement:
      "A question about one paragraph wants that paragraph's main point, and a question about the passage wants the point that covers every paragraph, so the right answer fits the size of the piece asked about.",
    spot_it: "'The main idea of the fourth paragraph is' versus 'The main idea of the passage is'.",
    test: "Use your gist note for that paragraph (or all of your notes for the passage) and reject choices that are too narrow or too wide.",
    trap: "For a paragraph question, a choice that states the whole passage's thesis; for a passage question, a choice that covers only one paragraph.",
    example: {
      wrong: "Paragraph 4 describes how the drought ended. Pick: 'Droughts have shaped the region's farming for a century' (the whole passage).",
      right: "Paragraph 4 describes how the drought ended. Pick: 'Heavy rains in 1937 brought the drought to a close.'",
    },
  },
  {
    ...base,
    id: "ARD-07",
    domain: "ACT Reading",
    skill: KID,
    name: "Inference stays one step away",
    statement:
      "An ACT inference ('suggests', 'implies', 'it can reasonably be inferred') is a small step from the lines, so the right choice is almost a paraphrase, and a choice that needs a chain of guesses is wrong.",
    spot_it: "'The passage most strongly suggests', 'it can reasonably be inferred that', 'the narrator implies'.",
    test: "Find the lines the inference comes from and check that the choice follows from them with no new facts added.",
    trap: "A bold or interesting conclusion that could be true but goes beyond what the lines show.",
    example: {
      wrong: "Text: 'Mara checked the clock for the third time and left her coffee untouched.' Pick: 'Mara was ill.'",
      right: "Text: 'Mara checked the clock for the third time and left her coffee untouched.' Pick: 'Mara was anxious about time.'",
    },
  },
  {
    ...base,
    id: "ARD-08",
    domain: "ACT Reading",
    skill: KID,
    name: "Order told is not order lived",
    statement:
      "For sequence questions, rebuild the real timeline, because passages, especially fiction and memoir, often tell events out of order with flashbacks and flash-forwards.",
    spot_it: "'Which event happened first', 'before the narrator moved', 'by the time', or a story that jumps between past and present.",
    test: "Note time markers (years, ages, 'years later', 'had already', 'earlier that morning') and put the events in a quick list before choosing.",
    trap: "Assuming the event described first in the passage happened first.",
    example: {
      wrong: "The story opens at a funeral and then recalls a childhood fishing trip. Pick: the funeral came first.",
      right: "The fishing trip ('when I was nine') came first; the funeral is the present-day frame.",
    },
  },
  {
    ...base,
    id: "ARD-09",
    domain: "ACT Reading",
    skill: KID,
    name: "Keep cause and effect straight",
    statement:
      "In a cause-effect question, find the passage's signal (because, led to, resulted in, due to, so, therefore) and keep the direction the passage gives; two things happening together is not a cause unless the passage says so.",
    spot_it: "'According to the passage, X occurred because', 'the result of', 'what led to'.",
    test: "Write the passage's cause and its effect with an arrow; the right choice has the same arrow direction.",
    trap: "The reversed arrow (effect named as cause), or a factor the passage mentions nearby but never links to the effect.",
    example: {
      wrong: "Passage: the factory closed, so many families moved away. Pick: the factory closed because families moved away.",
      right: "Passage: the factory closed, so many families moved away. Pick: families left as a result of the factory's closing.",
    },
  },
  {
    ...base,
    id: "ARD-10",
    domain: "ACT Reading",
    skill: KID,
    name: "Keep the comparison sides straight",
    statement:
      "When a passage compares two people, ideas, places or time periods, track which trait belongs to which side, because wrong choices swap the traits.",
    spot_it: "'Compared to', 'unlike', 'in contrast to', 'the main difference between', or two items described in turn.",
    test: "Make a two-column note (side A, side B) for the traits the passage gives, then check that each choice puts every trait in the right column.",
    trap: "A choice that names real traits from the passage but gives them to the wrong side.",
    example: {
      wrong: "Passage: the older theory relied on fossils, the newer one on DNA. Pick: 'the older theory relied on genetic data'.",
      right: "Passage: the older theory relied on fossils, the newer one on DNA. Pick: 'the newer theory draws on genetic evidence'.",
    },
  },
  {
    ...base,
    id: "ARD-11",
    domain: "ACT Reading",
    skill: KID,
    name: "Know whose view it is",
    statement:
      "Passages often report the views of critics, scientists or characters that differ from the author's or narrator's, so match each claim to the person who holds it before answering.",
    spot_it: "'According to the passage, the critics believed', 'the researchers argue', 'the author would most likely say', or quotations from several people.",
    test: "Find who says the idea in the lines (look for 'some argue', 'critics claimed', quotation marks, 'I'); the right choice credits the right person.",
    trap: "A view the author describes in order to reject it, offered as the author's own view.",
    example: {
      wrong: "Passage: 'Early critics dismissed the painter as a mere decorator; they were wrong.' Pick: the author sees her as a decorator.",
      right: "Same passage. Pick: the author disagrees with the early critics' low opinion of the painter.",
    },
  },
  {
    ...base,
    id: "ARD-12",
    domain: "ACT Reading",
    skill: KID,
    name: "Actions reveal what characters feel",
    statement:
      "In fiction, a character's feelings and motives are shown through actions, dialogue and small details, so infer the feeling those details actually show and keep it as strong as they show it.",
    spot_it: "'The narrator's reaction suggests', 'Grandmother most likely says this because', 'Eli's feelings toward the move are best described as'.",
    test: "List two or three concrete details (what the character does, says, avoids), name the feeling they share, then match it, including mixed feelings.",
    trap: "A one-sided or extreme emotion (furious, devastated, overjoyed) when the details show something quieter or mixed.",
    example: {
      wrong: "He packs slowly, keeps the old key, but smiles at the new house photo. Pick: 'bitter resentment'.",
      right: "He packs slowly, keeps the old key, but smiles at the new house photo. Pick: 'reluctant but hopeful'.",
    },
  },
  {
    ...base,
    id: "ARD-13",
    domain: "ACT Reading",
    skill: KID,
    name: "Relationships can change",
    statement:
      "When asked about a relationship between characters, describe both sides at the point the question asks about, because ACT stories often show a relationship shifting from start to end.",
    spot_it: "'The relationship between the narrator and her brother is best described as', 'by the end of the passage, Ana views her father'.",
    test: "Check whether the question names a time (at first, by the end); find how the two characters treat each other there, then match.",
    trap: "A choice that is true only at the start when the question asks about the end, or one that describes only one character's side.",
    example: {
      wrong: "Sisters argue early but laugh together at the end. Question asks about the end. Pick: 'tense and competitive'.",
      right: "Sisters argue early but laugh together at the end. Question asks about the end. Pick: 'easing into a closer understanding'.",
    },
  },
  {
    ...base,
    id: "ARD-14",
    domain: "ACT Reading",
    skill: KID,
    name: "Theme comes from what changes",
    statement:
      "The central idea of a literary passage usually comes from what the main character learns, realizes or changes, and it must fit the whole story rather than one scene.",
    spot_it: "'Which statement best expresses a central theme of the passage', 'the passage as a whole is mainly about'.",
    test: "Ask what is different for the main character at the end compared to the start; the right choice names that change in general terms the story fully supports.",
    trap: "A sweeping life lesson that the story never earns, or a choice drawn from one vivid scene.",
    example: {
      wrong: "A girl slowly accepts her grandfather's silence as his way of showing love. Pick: 'Families always communicate poorly.'",
      right: "Same story. Pick: 'Love can be expressed in ways that are easy to overlook.'",
    },
  },

  // ---------------------------------------------------------------- Author's Craft and Structure
  {
    ...base,
    id: "ARD-15",
    domain: "ACT Reading",
    skill: CRAFT,
    name: "Swap the word, keep the sense",
    statement:
      "For 'as it is used in line X, the word most nearly means', cover the word, predict a replacement from the sentence, then put each choice into the sentence and keep the one that preserves the meaning.",
    spot_it: "'As it is used in line 42, the word sound most nearly means' or 'in context, the phrase X most nearly means'.",
    test: "Read the full sentence (and the one before); a choice that makes the sentence say something different or odd is out, even if it is a correct dictionary meaning.",
    trap: "The word's most common meaning, which ACT includes because it does not fit the context.",
    example: {
      wrong: "'Her argument was sound, resting on years of data.' Pick: 'noisy'.",
      right: "'Her argument was sound, resting on years of data.' Pick: 'reasonable', because the data makes it well grounded.",
    },
  },
  {
    ...base,
    id: "ARD-16",
    domain: "ACT Reading",
    skill: CRAFT,
    name: "Figurative phrases mean something plain",
    statement:
      "When a question asks what a phrase or image means, translate the figure of speech into the plain idea it stands for in that moment of the passage.",
    spot_it: "'The narrator's statement that the house was holding its breath refers to', 'the phrase a door left ajar most likely refers to', quoted metaphors.",
    test: "Ask what is literally happening in the lines around the phrase; the right choice describes that plain situation, not the image.",
    trap: "A literal reading of the image (an actual door, actual breathing) or a choice that picks up the image's words.",
    example: {
      wrong: "'The house was holding its breath' before the verdict was read. Pick: 'the house was poorly ventilated'.",
      right: "'The house was holding its breath' before the verdict was read. Pick: 'everyone inside waited in tense silence'.",
    },
  },
  {
    ...base,
    id: "ARD-17",
    domain: "ACT Reading",
    skill: CRAFT,
    name: "Say what the part does",
    statement:
      "For 'the main function of the paragraph' or 'the author mentions X in order to', name the job the part does for the claim around it (introduce, illustrate, contrast, qualify, answer an objection, shift focus), not what it says.",
    spot_it: "'The main function of the second paragraph is to', 'the author most likely includes the anecdote about X in order to', 'the reference to X primarily serves to'.",
    test: "Find the claim the part serves (often in the sentence just before or after it), then pick the job verb that links the part to that claim.",
    trap: "A choice that accurately summarizes the part's content but gives the wrong job, or a job verb that is too strong (prove, refute) for what the part does.",
    example: {
      wrong: "Author claims city parks lower stress, then tells of a nurse who walks a park after shifts. Pick: 'to describe a nurse's routine'.",
      right: "Same passage. Pick: 'to illustrate the claim with a specific example'.",
    },
  },
  {
    ...base,
    id: "ARD-18",
    domain: "ACT Reading",
    skill: CRAFT,
    name: "Structure choices must match in order",
    statement:
      "For questions about how a passage or section is organized, every piece of the choice must match the passage and must come in the same order the passage uses.",
    spot_it: "'Which choice best describes the organization of the passage', 'the passage is structured primarily as', 'the first three paragraphs move from'.",
    test: "Use your paragraph gist notes as an outline and check each part of the choice against them from first to last.",
    trap: "A choice with the right parts in the wrong order, or one that adds a part the passage never has (a solution, a counterargument).",
    example: {
      wrong: "Passage: a problem, its history, then a proposed fix. Pick: 'a proposed fix, followed by the problem it solves'.",
      right: "Passage: a problem, its history, then a proposed fix. Pick: 'a problem traced over time, then a possible solution'.",
    },
  },
  {
    ...base,
    id: "ARD-19",
    domain: "ACT Reading",
    skill: CRAFT,
    name: "Author tone is usually measured",
    statement:
      "ACT authors are thoughtful and usually moderate, so the right tone or attitude word is often mild (appreciative, skeptical, concerned, admiring, wry) rather than extreme, and it is rarely neutral when the author takes a side.",
    spot_it: "'The author's attitude toward X is best described as', 'the tone of the passage is', 'the author regards X with'.",
    test: "Collect the author's judgment words (adjectives and adverbs about the subject), decide positive, negative or mixed, then choose the choice with that direction and a matching strength.",
    trap: "An extreme word (contempt, reverence, outrage) or 'indifferent' and 'detached' for an author who clearly cares.",
    example: {
      wrong: "Author calls a new policy 'promising, if untested'. Pick: 'enthusiastic endorsement'.",
      right: "Author calls a new policy 'promising, if untested'. Pick: 'cautious optimism'.",
    },
  },
  {
    ...base,
    id: "ARD-20",
    domain: "ACT Reading",
    skill: CRAFT,
    name: "Contrast words point to the author",
    statement:
      "After a contrast word (but, however, yet, still, although, in fact, actually) the author usually turns from a view they are reporting to the view they actually hold, so the author's position sits after the turn.",
    spot_it: "Point-of-view or claim questions, and passages that open with 'Many people believe' or 'It is often said'.",
    test: "Find the turn word near the cited lines and read what comes after it; that is the author's claim.",
    trap: "A choice that restates the popular view from before the turn as if it were the author's own.",
    example: {
      wrong: "'Many assume bees need wild meadows. In fact, city rooftops support thriving hives.' Pick: 'bees need wild meadows'.",
      right: "Same lines. Pick: 'urban settings can support healthy bee colonies'.",
    },
  },
  {
    ...base,
    id: "ARD-21",
    domain: "ACT Reading",
    skill: CRAFT,
    name: "Who tells it, and from when",
    statement:
      "In literary passages, identify the narrator (first person 'I' or an outside third-person voice) and when they are telling it, because an adult narrator looking back often understands more than they did at the time.",
    spot_it: "'The point of view from which the passage is told is best described as', 'the narrator's perspective', 'looking back, the narrator realizes'.",
    test: "Check pronouns (I, we, he, she) and time cues ('back then', 'now I see', 'I was twelve'); the right choice names both who narrates and from when.",
    trap: "Giving the child's view at the time when the question asks about the adult narrator's present understanding, or calling a first-person narrator 'an outside observer'.",
    example: {
      wrong: "'At ten I thought my father was simply strict; only later did I see how afraid he was.' Pick: 'a child who sees her father as strict'.",
      right: "Same lines. Pick: 'an adult reflecting on how her understanding of her father changed'.",
    },
  },
  {
    ...base,
    id: "ARD-22",
    domain: "ACT Reading",
    skill: CRAFT,
    name: "Word choice sets the tone",
    statement:
      "When asked why an author uses a particular word or detail, look at its connotation and what it emphasizes in context, since the answer is about effect (mood, attitude, emphasis), not definition.",
    spot_it: "'The author's use of the word X primarily serves to emphasize', 'the description of X mainly creates a sense of', 'the repeated phrase'.",
    test: "Ask what feeling or judgment the word carries compared with a plainer word; match the choice to that difference.",
    trap: "A choice that defines the word or repeats its literal content instead of naming its effect.",
    example: {
      wrong: "The author says the old mill 'loomed' over the town. Pick: 'to show the mill's exact height'.",
      right: "The author says the old mill 'loomed' over the town. Pick: 'to suggest the mill felt imposing or threatening'.",
    },
  },

  // ---------------------------------------------------------------- Integration of Knowledge and Ideas
  {
    ...base,
    id: "ARD-23",
    domain: "ACT Reading",
    skill: IKI,
    name: "Paired passages: one at a time",
    statement:
      "With Passage A and Passage B, read A and answer its questions, then read B and answer its questions, and only then answer the questions about both passages.",
    spot_it: "Two shorter passages labeled Passage A and Passage B under one set of questions, ordered A questions, B questions, then both.",
    test: "Before the 'both passages' questions, write each author's main claim and attitude in five words.",
    trap: "Mixing up which passage said what because both were read before any questions were answered.",
    example: {
      wrong: "Read both passages, then answer a Passage A question with a detail that actually comes from Passage B.",
      right: "Answer Passage A's questions right after reading A; the only B details in play are in the questions about B or both.",
    },
  },
  {
    ...base,
    id: "ARD-24",
    domain: "ACT Reading",
    skill: IKI,
    name: "Name how the passages relate",
    statement:
      "Paired passages share a topic but differ in focus or stance, so name the relationship (agree, disagree, one gives an example of the other, one extends or qualifies the other) before reading the choices.",
    spot_it: "'Compared to Passage A, Passage B focuses more on', 'which choice best describes the relationship between the passages', 'unlike the author of Passage A'.",
    test: "Put your two five-word summaries side by side and say in one sentence how B relates to A; check that the choice is true of each passage separately.",
    trap: "Inventing a disagreement where the passages simply cover different aspects, or a choice that is right about one passage and wrong about the other.",
    example: {
      wrong: "A: history of jazz in New Orleans. B: a musician's memories of playing there. Pick: 'B rejects A's account of jazz history'.",
      right: "Same pair. Pick: 'B offers a personal view of a scene A describes in general terms'.",
    },
  },
  {
    ...base,
    id: "ARD-25",
    domain: "ACT Reading",
    skill: IKI,
    name: "Predict a response from stated views",
    statement:
      "When asked how one author would respond to the other, use what that author actually says about the issue, and pick the response that addresses the specific claim named in the question.",
    spot_it: "'The author of Passage A would most likely respond to the claim in Passage B (lines 60 to 64) by', 'how would the author of B view A's conclusion'.",
    test: "Find the claim in the one passage, find where the other author touches the same point, then match direction (agree, doubt, reject) and strength.",
    trap: "A response that fits the author's general personality but ignores the specific claim, or one far more hostile than the author's tone.",
    example: {
      wrong: "A praises remote work but notes it isolates new hires; B claims remote work suits everyone. Pick: A would call B's view absurd.",
      right: "Same pair. Pick: A would partly agree but note that new employees may struggle.",
    },
  },
  {
    ...base,
    id: "ARD-26",
    domain: "ACT Reading",
    skill: IKI,
    name: "Separate the claim from its support",
    statement:
      "To analyze an argument, first find the author's claim, then identify what supports it (a study, statistic, expert quotation, example or personal experience), and keep facts apart from opinions.",
    spot_it: "'The author supports the claim that X mainly by', 'which statement from the passage is an opinion rather than a fact', 'the evidence the author provides is'.",
    test: "Label the claim and point to the support the question asks about; a fact can be checked, an opinion is a judgment someone could dispute.",
    trap: "Naming a type of support the passage does not use (a survey when it gives an anecdote), or calling a judgment word ('remarkable') a fact.",
    example: {
      wrong: "Author argues for later school start times, citing one tired student's story. Pick: 'by citing a large survey of students'.",
      right: "Same passage. Pick: 'by describing one student's experience'.",
    },
  },
  {
    ...base,
    id: "ARD-27",
    domain: "ACT Reading",
    skill: IKI,
    name: "Apply the author's view, not yours",
    statement:
      "When asked what the author would most likely agree with or how the author's idea applies to a new case, extend the author's stated reasoning only as far as it clearly reaches.",
    spot_it: "'The author would most likely agree that', 'which situation best illustrates the principle described in the passage', 'based on the passage, the author would view X as'.",
    test: "State the author's principle in one sentence, then check that the choice follows from it without adding a stronger or broader claim.",
    trap: "A choice that pushes the author's view further than stated, or one that reflects the student's opinion on the topic.",
    example: {
      wrong: "Author says small local museums preserve community memory. Pick: 'the author would want all large museums closed'.",
      right: "Same passage. Pick: 'the author would value a town archive of local photographs'.",
    },
  },
  {
    ...base,
    id: "ARD-28",
    domain: "ACT Reading",
    skill: IKI,
    name: "Graphic answers: true and relevant",
    statement:
      "For a passage with a graph, table or figure, read the title, labels and units first, and pick the choice that is accurate to the graphic and also connects to the passage's claim the way the question asks.",
    spot_it: "A chart or table beside the passage and questions such as 'the data in the graph most strongly support which claim from the passage' or 'according to the table'.",
    test: "Find the exact row, bar or point named in the choice and confirm the value; then check that it bears on the passage claim (supports, extends, contradicts) as the question requires.",
    trap: "A statement true of the graphic but unrelated to the passage claim, or one that reads the wrong row, year or unit.",
    example: {
      wrong: "Passage claims bike commuting grew fastest after 2015. Pick: 'more people walk than bike' (true in the table, off the claim).",
      right: "Same passage. Pick: 'the table shows the largest yearly rise in bike commuting between 2015 and 2018'.",
    },
  },
  {
    ...base,
    id: "ARD-29",
    domain: "ACT Reading",
    skill: IKI,
    name: "Graphics show only their measures",
    statement:
      "A graph or table shows values for the groups, places and years it covers; it does not show causes, opinions or anything outside its range unless the passage adds that.",
    spot_it: "Choices that explain why the data look as they do, or that extend a trend beyond the years or groups shown.",
    test: "Ask whether the choice could be checked from the numbers alone; if it needs a reason, a prediction or a missing group, it needs passage support too.",
    trap: "A choice that turns a correlation in the chart into a cause, or projects a trend past the last data point.",
    example: {
      wrong: "Table: test scores rose as library hours rose, 2010 to 2015. Pick: 'longer library hours caused higher scores'.",
      right: "Same table. Pick: 'scores and library hours both increased over the period shown'.",
    },
  },
  {
    ...base,
    id: "ARD-30",
    domain: "ACT Reading",
    skill: IKI,
    name: "Strengthen or weaken the link",
    statement:
      "To strengthen or weaken an author's argument, target the link between the evidence and the conclusion: the right choice makes that link more or less believable, not just the topic more or less important.",
    spot_it: "'Which of the following, if true, would most strengthen (or weaken) the author's claim', 'the author's reasoning would be most undermined by'.",
    test: "Write the argument as 'evidence, therefore conclusion'; pick the choice that directly confirms or breaks that 'therefore'.",
    trap: "A choice on the same topic that neither supports nor undercuts the specific conclusion, or one that pushes in the opposite direction from the question.",
    example: {
      wrong: "Claim: a new trail raised visitor numbers because visits rose after it opened. Weaken with: 'the trail cost a lot to build'.",
      right: "Same claim. Weaken with: 'visitor numbers rose by the same amount at nearby parks with no new trail'.",
    },
  },
];

/** Existing SAT rule ids that also decide ACT Reading questions (same rule, same wording). */
export const SAT_RULES_FOR_ACT_READING: string[] = ["CID-01", "CID-02", "WIC-02", "TSP-01", "CTC-01", "GEN-01", "GEN-02", "GEN-03"];

/** Strategy for every ACT Reading question. */
export const ACT_READING_GENERAL_PLAYBOOK: PlaybookEntry = {
  route: [
    "Every answer is in the passage: point to the lines that prove your choice, and treat outside knowledge as a trap.",
    "Enhanced ACT (2025 on): 36 questions in 40 minutes, four shorter passages of about 9 questions, so about 10 minutes per passage. Older practice tests: 40 questions in 35 minutes, four passages of 10, so about 8 minutes 45 seconds per passage.",
    "Start with the passage type you read best (literary narrative, social science, humanities, natural science, a paired set, or one with a graphic); the passages do not have to be done in order.",
    "Read once for the map: jot a three- to five-word gist per paragraph and mark where the author's own view shows.",
    "Answer line and paragraph questions first, keyword detail questions next, and whole-passage questions (main idea, purpose, structure) last.",
    "For a cited line, read a sentence before and after, predict the answer in your own words, then match.",
    "No penalty for wrong answers: never leave a bubble blank. Some questions are unscored field-test items that look like the rest, so treat every passage as scored.",
  ],
  traps: [
    "Right fact, wrong part: a choice true in another paragraph or at another moment in the story.",
    "Half right is all wrong: one unsupported clause sinks a choice.",
    "Extreme words (always, never, only, entirely, prove, all) go beyond what the passage supports.",
    "True but not the question: a choice that is accurate about the passage but answers a different question.",
    "Wrong speaker: a view the author reports (critics, a character) offered as the author's own.",
    "Too strong or too weak: an emotion, tone or claim at the wrong intensity.",
  ],
  lists: [
    "Passage types: literary narrative or prose fiction, social science, humanities, natural science; formats: single passage, paired passages (Passage A and Passage B), passage with a graph, table or figure.",
    "Reporting categories on the enhanced ACT: Key Ideas and Details 44 to 52%, Craft and Structure 26 to 33%, Integration of Knowledge and Ideas 19 to 26%.",
    "Question stem flags: EXCEPT, NOT, LEAST (find the false one); 'as it is used in line X' (context meaning); 'in order to', 'primarily serves to' (function); 'suggests', 'implies' (one-step inference).",
  ],
  mixups: [
    "Old advice says 40 questions in 35 minutes; the enhanced ACT gives 40 minutes for 36 questions, so the per-question pace is slower and more forgiving.",
    "Science no longer counts toward the composite on the enhanced ACT; Reading does, together with English and Math.",
    "ACT Reading choices are A to D on odd-numbered questions and F to J on even-numbered ones; a skipped or misread number can shift every bubble after it.",
  ],
};

/** Strategy per ACT skill in this section. */
export const ACT_READING_PLAYBOOK: Record<string, PlaybookEntry> = {
  "Key Ideas and Details": {
    route: [
      "For a detail with line numbers, go to the lines, read a little around them, paraphrase, then match.",
      "For a detail without line numbers, pick a searchable keyword (name, number, date, italic term), find it with your paragraph map, and read that sentence.",
      "For main idea questions, match the scope: one paragraph wants that paragraph's point, the passage wants the point that covers every paragraph.",
      "For inferences, stay one short step from the lines; the right choice is nearly a paraphrase.",
      "For sequence, cause-effect and comparisons, write a quick timeline, an arrow, or two columns before reading the choices.",
      "In fiction, infer feelings and relationships from actions and dialogue, at the moment the question names.",
    ],
    traps: [
      "Reused passage words with a changed meaning (who did what, how much, when).",
      "Reversed cause and effect, or a nearby factor the passage never links to the effect.",
      "Traits swapped between the two things compared.",
      "The order the passage tells events in taken as the order they happened.",
      "An emotion stronger or simpler than the details show; mixed feelings are common in ACT fiction.",
      "A main idea that covers one paragraph only, or a paragraph answer that states the whole thesis.",
    ],
    lists: [
      "Inference stems: suggests, implies, most strongly indicates, it can reasonably be inferred, most likely.",
      "Cause signals: because, since, due to, as a result, led to, so, therefore, consequently.",
      "Time cues: years and ages, had already, earlier, later, by the time, once, now, back then.",
    ],
  },
  "Author's Craft and Structure": {
    route: [
      "Context meaning: cover the word, predict from the sentence, swap each choice in, keep the one that keeps the meaning.",
      "Function: find the claim the part serves (usually the sentence before or after) and name the job with a verb (illustrate, contrast, qualify, introduce, shift).",
      "Structure: use your paragraph gists as an outline and check every part of a choice in order.",
      "Tone and point of view: collect the author's judgment words, decide direction (positive, negative, mixed) and strength, then match.",
      "Narration: identify who tells the story and from when; an adult looking back may know more than the child did.",
      "Contrast words (but, however, yet, in fact) mark the turn from a reported view to the author's own.",
    ],
    traps: [
      "The most common meaning of a word that the context rules out.",
      "A literal reading of a figurative phrase.",
      "A choice that restates what a part says instead of what it does.",
      "The right parts of a structure in the wrong order.",
      "Extreme tone words (contempt, reverence) or 'neutral' for an author who takes a side.",
      "The popular view the author sets up to reject, given as the author's view.",
    ],
    lists: [
      "Job verbs: introduce, illustrate, support, contrast, qualify, concede, criticize, shift focus, provide background, foreshadow.",
      "Common correct tone words: appreciative, admiring, cautious, skeptical, concerned, nostalgic, wry, reflective, ambivalent.",
      "Usually wrong tone words: contemptuous, furious, apathetic, indifferent, worshipful.",
    ],
  },
  "Integration of Knowledge and Ideas": {
    route: [
      "Paired passages: read A and answer its questions, read B and answer its questions, then answer the questions about both.",
      "Before the 'both passages' questions, write each author's claim and attitude in five words and name how B relates to A.",
      "To predict one author's response, use what that author says on the same point, at the same strength.",
      "Arguments: find the claim, then the type of support (study, statistic, quotation, example, personal experience); facts can be checked, opinions are judgments.",
      "Strengthen or weaken: target the link between evidence and conclusion.",
      "Graphics: read the title, labels and units first; the right choice is accurate to the graphic and connects to the passage claim the way the question asks.",
    ],
    traps: [
      "A choice true of one passage and false of the other.",
      "A disagreement invented between passages that simply focus on different aspects.",
      "A response far harsher than the author's tone.",
      "A view pushed further than the author takes it, or the student's own opinion.",
      "True data that does not bear on the claim, or the wrong row, year or unit.",
      "A cause or a future trend read into a chart that shows only values.",
    ],
    lists: [
      "Passage relationships: agrees with, disagrees with, gives an example of, extends, qualifies, offers a personal view of, provides background for.",
      "Support types: study or experiment, statistic, expert quotation, historical example, anecdote or personal experience, analogy.",
    ],
  },
};

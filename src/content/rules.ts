import type { Domain, Section, Skill } from "@/lib/questions/taxonomy";
import { MATH_RULES } from "./math-rules";

export interface Rule {
  id: string;
  section: Section;
  domain: Domain | "General";
  skill: Skill | "General";
  /** 3 to 6 words */
  name: string;
  /** One sentence a student can memorize */
  statement: string;
  /** How to recognize the question type */
  spot_it: string;
  /** The quick mechanical check */
  test: string;
  /** The usual wrong-answer bait */
  trap: string;
  example: { wrong: string; right: string };
  /** Math only: the fastest reliable route, often in the built-in Desmos calculator. */
  shortcut?: string;
}

const SEC = "Standard English Conventions" as const;
const EOI = "Expression of Ideas" as const;
const CAS = "Craft and Structure" as const;
const INI = "Information and Ideas" as const;

const RW_RULES: Omit<Rule, "section">[] = [
  // Boundaries
  {
    id: "BND-01",
    domain: SEC,
    skill: "Boundaries",
    name: "Joining two complete sentences",
    statement:
      "Two independent clauses can be joined only by a period, a semicolon, a comma plus a FANBOYS word (for, and, nor, but, or, yet, so), a colon when the second clause explains the first, or a dash.",
    spot_it: "Both sides of the blank could stand alone as sentences, each with its own subject and verb.",
    test: "Cover the punctuation and read each side alone; if both are full sentences, a comma by itself (comma splice) or nothing at all (run-on) is wrong.",
    trap: "A comma alone between two sentences looks natural because we pause there when speaking.",
    example: {
      wrong: "The study ended in 2019, the results were published a year later.",
      right: "The study ended in 2019; the results were published a year later.",
    },
  },
  {
    id: "BND-02",
    domain: SEC,
    skill: "Boundaries",
    name: "Dependent clause placement",
    statement:
      "A dependent clause that opens the sentence is followed by a comma, but a dependent clause that ends the sentence usually takes no comma before it.",
    spot_it: "A clause starting with because, although, when, if, since, while, after, or unless.",
    test: "Find the subordinating word; if its clause comes first, put a comma after it; if it comes second, drop the comma (contrast clauses with although or whereas are the exception and often keep one).",
    trap: "A comma before a final because-clause feels polite but is wrong; a missing comma after an opening clause runs it into the subject.",
    example: {
      wrong: "Although the bridge was closed the ferry kept running.",
      right: "Although the bridge was closed, the ferry kept running.",
    },
  },
  {
    id: "BND-03",
    domain: SEC,
    skill: "Boundaries",
    name: "Colon after a complete sentence",
    statement: "A colon must come after a complete sentence and introduces a list, an example, or an explanation.",
    spot_it: "The blank sits before a list, a quotation, or a phrase that clarifies what came before.",
    test: "Read everything before the colon alone; if it is not a full sentence, the colon is wrong.",
    trap: "A colon placed after 'such as', 'including', or a verb ('The ingredients are:') breaks the complete-sentence rule.",
    example: {
      wrong: "The kit includes: a map, a compass, and a whistle.",
      right: "The kit includes three tools: a map, a compass, and a whistle.",
    },
  },
  {
    id: "BND-04",
    domain: SEC,
    skill: "Boundaries",
    name: "Semicolon between full sentences",
    statement: "A semicolon joins two complete sentences, or separates items in a list whose items already contain commas.",
    spot_it: "The blank is between two full sentences, or inside a long list of places or names with internal commas.",
    test: "Swap the semicolon for a period; if both sides still read as complete sentences, the semicolon is fine.",
    trap: "A semicolon before a fragment ('; such as the oak tree') is wrong because the second part cannot stand alone.",
    example: {
      wrong: "The team visited Austin, Texas, Portland, Oregon, and Boise, Idaho.",
      right: "The team visited Austin, Texas; Portland, Oregon; and Boise, Idaho.",
    },
  },
  {
    id: "BND-05",
    domain: SEC,
    skill: "Boundaries",
    name: "Nonessential information in pairs",
    statement:
      "Nonessential information is set off by a matching pair (two commas, two dashes, or two parentheses), while essential information gets no punctuation at all.",
    spot_it: "An interrupting phrase or clause in the middle of a sentence, often starting with 'which', a name, or a description.",
    test: "Remove the phrase; if the sentence still works and means the same thing, it is nonessential and needs a matching pair on both sides.",
    trap: "Mixing a comma on one side with a dash on the other, or dropping the closing comma.",
    example: {
      wrong: "The painter, who trained in Lisbon moved to Paris in 1920.",
      right: "The painter, who trained in Lisbon, moved to Paris in 1920.",
    },
  },
  {
    id: "BND-06",
    domain: SEC,
    skill: "Boundaries",
    name: "No comma between subject and verb",
    statement: "Never put a single comma between a subject and its verb, or between a verb and its object.",
    spot_it: "A comma right after a long subject (often ending in a prepositional phrase) or right before a that-clause object.",
    test: "Find the main subject and verb; if exactly one comma separates them, delete it.",
    trap: "A long subject ('The results of the three-year survey of coastal towns') makes a comma feel needed before the verb.",
    example: {
      wrong: "The results of the survey, show a clear trend.",
      right: "The results of the survey show a clear trend.",
    },
  },
  {
    id: "BND-07",
    domain: SEC,
    skill: "Boundaries",
    name: "Comma after an introduction",
    statement: "An introductory phrase or clause is followed by a comma, and then the main clause begins with its subject.",
    spot_it: "The sentence starts with a prepositional phrase, a participle (-ing or -ed), or a transition word.",
    test: "Find where the introductory part ends and the subject begins; put one comma there and nowhere else.",
    trap: "Putting the comma one word too late or too early, which splits the subject from its verb.",
    example: {
      wrong: "After the storm passed the crew, repaired the roof.",
      right: "After the storm passed, the crew repaired the roof.",
    },
  },
  {
    id: "BND-08",
    domain: SEC,
    skill: "Boundaries",
    name: "A sentence needs a real verb",
    statement: "A sentence needs a subject and a finite verb; an -ing form or a 'to' form alone does not make a sentence.",
    spot_it: "Choices that differ only in verb form: 'being', 'having', 'to be', 'is', 'was'.",
    test: "Read from the capital letter to the period; if there is no verb that shows tense, it is a fragment.",
    trap: "'The committee, having reviewed the proposal.' looks finished but has no main verb.",
    example: {
      wrong: "The committee, having reviewed the proposal and finding it incomplete.",
      right: "The committee reviewed the proposal and found it incomplete.",
    },
  },
  {
    id: "BND-09",
    domain: SEC,
    skill: "Boundaries",
    name: "Which with a comma, that without",
    statement: "A 'which' or 'who' clause that adds extra information takes a comma before it; a 'that' clause is essential and takes no comma.",
    spot_it: "Choices that swap 'which' and 'that' or add and remove a comma before them.",
    test: "Ask whether the clause identifies which thing you mean (that, no comma) or just adds detail (which, comma).",
    trap: "'that' with a comma before it, or 'which' with no comma when the clause is extra.",
    example: {
      wrong: "The bridge, that opened in 1932 is still in use.",
      right: "The bridge that opened in 1932 is still in use.",
    },
  },
  {
    id: "BND-10",
    domain: SEC,
    skill: "Boundaries",
    name: "Question mark only for direct questions",
    statement: "Only a direct question ends with a question mark; a question reported inside a statement ends with a period.",
    spot_it: "Sentences containing 'asked whether', 'wondered how', or 'the question of why'.",
    test: "Check whether the sentence itself asks something of the reader; if it only reports a question, use a period.",
    trap: "A question mark after 'The researchers asked whether the drug worked' because a question word appears.",
    example: {
      wrong: "Scientists wondered why the colony collapsed?",
      right: "Scientists wondered why the colony collapsed.",
    },
  },
  {
    id: "BND-11",
    domain: SEC,
    skill: "Boundaries",
    name: "Names and titles",
    statement:
      "A description followed by a name takes no commas when the name is essential ('the author Toni Morrison'), but a name followed by a description takes a pair of commas when the name is already known.",
    spot_it: "A person or work named right after a role or description, with choices that add or remove commas around the name.",
    test: "Ask whether the name narrows down who is meant; if yes, no commas; if the role already identifies one person, use a pair of commas.",
    trap: "'the author, Toni Morrison, wrote' when there are many authors, or 'Toni Morrison the author wrote' with no commas.",
    example: {
      wrong: "The chemist, Marie Curie discovered polonium.",
      right: "The chemist Marie Curie discovered polonium.",
    },
  },

  // Form, Structure, and Sense
  {
    id: "FSS-01",
    domain: SEC,
    skill: "Form, Structure, and Sense",
    name: "Subject-verb agreement",
    statement:
      "Cross out prepositional phrases and interrupters, find the real subject, and match the verb to its number ('the number of X is', 'a number of X are', each/every/neither singular, 'A and B' plural).",
    spot_it: "Choices that differ between singular and plural verb forms (is/are, has/have, was/were).",
    test: "Strip 'of the...', 'in the...', and 'along with...' phrases and read subject plus verb alone.",
    trap: "The noun closest to the verb is often not the subject ('The list of items is').",
    example: {
      wrong: "The collection of letters were donated.",
      right: "The collection of letters was donated.",
    },
  },
  {
    id: "FSS-02",
    domain: SEC,
    skill: "Form, Structure, and Sense",
    name: "Pronoun agreement",
    statement:
      "A pronoun matches its antecedent in number (it/its for singular, they/their for plural) and the antecedent must be one clear noun.",
    spot_it: "Choices that switch between it, they, this, these, its, or their.",
    test: "Find the noun the pronoun replaces and check singular versus plural; if you cannot find one clear noun, the pronoun is ambiguous.",
    trap: "Collective and singular nouns like 'the company' or 'each student' pulling a plural 'they'.",
    example: {
      wrong: "The museum expanded their galleries.",
      right: "The museum expanded its galleries.",
    },
  },
  {
    id: "FSS-03",
    domain: SEC,
    skill: "Form, Structure, and Sense",
    name: "Consistent verb tense",
    statement:
      "Keep the verb tense consistent with the surrounding sentences unless a time word signals a change, and use past tense for dated past events.",
    spot_it: "Choices that differ only in tense (worked, works, will work, had worked).",
    test: "Read the sentences before and after the blank and match their tense; look for time markers like 'in 1998' or 'today'.",
    trap: "'had' past perfect when a simple past is enough, or present tense for a historical date.",
    example: {
      wrong: "In 1911, Hiram Bingham reaches Machu Picchu.",
      right: "In 1911, Hiram Bingham reached Machu Picchu.",
    },
  },
  {
    id: "FSS-04",
    domain: SEC,
    skill: "Form, Structure, and Sense",
    name: "Modifier next to its noun",
    statement: "The noun right after an opening descriptive phrase must be the thing that phrase describes.",
    spot_it: "A sentence starting with an -ing or -ed phrase and a comma, with choices that reorder the main clause.",
    test: "Ask who or what is doing the action in the opening phrase, then check that noun comes right after the comma.",
    trap: "'Walking to school, the rain soaked Maya' makes the rain do the walking.",
    example: {
      wrong: "Founded in 1850, settlers built the town by the river.",
      right: "Founded in 1850, the town was built by the river.",
    },
  },
  {
    id: "FSS-05",
    domain: SEC,
    skill: "Form, Structure, and Sense",
    name: "Parallel forms in lists",
    statement: "Items in a list or comparison must share the same grammatical form.",
    spot_it: "A list of two or more actions, nouns, or phrases joined by 'and', 'or', or 'not only... but also'.",
    test: "Read each item next to the shared starting words; each should fit the same way.",
    trap: "Mixing 'to run' with 'running', or a noun with a verb phrase.",
    example: {
      wrong: "The job requires writing reports, to manage budgets, and travel.",
      right: "The job requires writing reports, managing budgets, and traveling.",
    },
  },
  {
    id: "FSS-06",
    domain: SEC,
    skill: "Form, Structure, and Sense",
    name: "Possessives versus contractions",
    statement:
      "Use its/their/whose for possession and it's/they're/who's for contractions; put the apostrophe before the s for a singular owner and after the s for a plural owner.",
    spot_it: "Choices with its, it's, their, there, they're, whose, who's, or apostrophes in different places.",
    test: "Expand the contraction ('it is'); if it does not fit, use the possessive; then count the owners.",
    trap: "'it's' used for possession, or 'students' with no apostrophe when the students own something.",
    example: {
      wrong: "The bird spread it's wings.",
      right: "The bird spread its wings.",
    },
  },
  {
    id: "FSS-07",
    domain: SEC,
    skill: "Form, Structure, and Sense",
    name: "Compare like with like",
    statement: "Compare like with like; use 'that of' or 'those of' so a thing is compared with a thing, not with a person or a place.",
    spot_it: "A sentence with 'than', 'like', 'unlike', 'similar to', or 'compared with'.",
    test: "Name the two things being compared; they must be the same kind of thing.",
    trap: "'The wingspan of the eagle is larger than the hawk' compares a wingspan with a bird.",
    example: {
      wrong: "The output of the new plant exceeds the old plant.",
      right: "The output of the new plant exceeds that of the old plant.",
    },
  },
  {
    id: "FSS-08",
    domain: SEC,
    skill: "Form, Structure, and Sense",
    name: "Who, which, where, when",
    statement: "Use 'who' for people, 'which' or 'that' for things, 'where' only for places, and 'when' for times.",
    spot_it: "Choices that swap who, which, that, where, whom, or when.",
    test: "Check what the pronoun refers to and pick the pronoun for that kind of noun.",
    trap: "'the era where' or 'the book where' when the noun is not a place.",
    example: {
      wrong: "The study, where researchers tracked 500 patients, lasted a year.",
      right: "The study, in which researchers tracked 500 patients, lasted a year.",
    },
  },

  // Transitions
  {
    id: "TRN-01",
    domain: EOI,
    skill: "Transitions",
    name: "Decide the relationship first",
    statement:
      "Decide the relationship between the two sentences before reading the choices: addition, contrast, cause and effect, example, restatement, sequence, emphasis, or conclusion.",
    spot_it: "The blank is at the start of a sentence and the four choices are all transition words.",
    test: "Read the sentence before and the sentence after; say the link in one plain word (but, so, also, for example) and then match it.",
    trap: "Picking a transition that sounds smooth without checking the actual logic between the two sentences.",
    example: {
      wrong: "The vaccine was effective in trials. However, it was approved for public use.",
      right: "The vaccine was effective in trials. Consequently, it was approved for public use.",
    },
  },
  {
    id: "TRN-02",
    domain: EOI,
    skill: "Transitions",
    name: "Transition categories",
    statement:
      "Transitions come in categories (addition: also, furthermore, moreover; contrast: however, nevertheless, in contrast, still; cause: therefore, thus, consequently, as a result; example: for example, for instance; restatement: in other words, that is; sequence: then, subsequently, meanwhile, finally; emphasis: indeed, in fact; concession: granted, admittedly), and two choices from the same category cannot both be right.",
    spot_it: "Choices like 'however' and 'nevertheless', or 'therefore' and 'consequently', appearing together.",
    test: "Sort the four choices by category; if two match your reading, the relationship was misread, and the answer is usually the category with one member.",
    trap: "Treating 'for example' and 'specifically', or 'in fact' and 'indeed', as interchangeable with the right category.",
    example: {
      wrong: "Coral reefs are vital ecosystems. Nevertheless, they protect coastlines from storms.",
      right: "Coral reefs are vital ecosystems. In addition, they protect coastlines from storms.",
    },
  },
  {
    id: "TRN-03",
    domain: EOI,
    skill: "Transitions",
    name: "For example needs an example",
    statement:
      "'For example' must be followed by an actual example of the previous claim, 'specifically' by a narrowing of it, and 'similarly' by a parallel case.",
    spot_it: "The sentence after the blank gives a case, a detail, or a parallel.",
    test: "Ask whether the second sentence is an instance (for example), a zoom-in (specifically), or a matching situation (similarly).",
    trap: "'for example' before a sentence that merely continues the point without giving an instance.",
    example: {
      wrong: "Many birds migrate at night. Similarly, warblers use the stars to navigate.",
      right: "Many birds migrate at night. For example, warblers use the stars to navigate.",
    },
  },

  // Rhetorical Synthesis
  {
    id: "RHS-01",
    domain: EOI,
    skill: "Rhetorical Synthesis",
    name: "Do exactly the stated goal",
    statement:
      "Underline the goal stated in the question (emphasize, compare, introduce, explain how, summarize for an audience); the right choice does exactly that goal using only the notes.",
    spot_it: "A bulleted list of notes and a question beginning 'The student wants to...'.",
    test: "Check each choice against the goal verb and the audience; eliminate any that do a different job or add facts not in the notes.",
    trap: "A choice that is true to the notes but accomplishes a different goal, such as describing when the goal was to compare.",
    example: {
      wrong: "Goal: emphasize a difference. Pick: 'Both parks were founded in the 1870s.'",
      right: "Goal: emphasize a difference. Pick: 'Unlike Yellowstone, Yosemite was first protected by the state.'",
    },
  },
  {
    id: "RHS-02",
    domain: EOI,
    skill: "Rhetorical Synthesis",
    name: "Audience decides the detail",
    statement:
      "If the audience is 'unfamiliar with' the topic, the right choice must name and briefly introduce it; if the audience is familiar, the choice can skip the basics.",
    spot_it: "The question mentions an audience that is familiar or unfamiliar with something.",
    test: "Check whether the choice names and briefly explains the subject when the audience is unfamiliar.",
    trap: "A choice that uses the technical term or name without explaining it to an unfamiliar audience.",
    example: {
      wrong: "For readers unfamiliar with the author, pick: 'His later works were written in Gikuyu.'",
      right: "For readers unfamiliar with the author, pick: 'Kenyan author Ngugi wa Thiong'o wrote his later works in Gikuyu.'",
    },
  },

  // Words in Context
  {
    id: "WIC-01",
    domain: CAS,
    skill: "Words in Context",
    name: "Predict, then match",
    statement:
      "Cover the choices, predict a word from the sentence's own clue (a contrast, a restatement, or an example), then match the prediction to the choices and check tone and part of speech.",
    spot_it: "A blank with four single-word or short-phrase choices and the question 'Which choice completes the text with the most logical and precise word or phrase?'",
    test: "Find the clue words near the blank; the sentence usually defines the missing word itself.",
    trap: "Picking a word you associate with the topic rather than the one the clue demands.",
    example: {
      wrong: "Clue: 'rather than relying on a single method, the team used a ___ approach.' Pick: 'rigorous'.",
      right: "Clue: 'rather than relying on a single method, the team used a ___ approach.' Pick: 'varied'.",
    },
  },
  {
    id: "WIC-02",
    domain: CAS,
    skill: "Words in Context",
    name: "Watch for secondary meanings",
    statement: "The tested word often uses a secondary meaning, so test the word in the sentence rather than its most common definition.",
    spot_it: "A familiar word that would be strange in its usual sense ('table a motion', 'a novel approach', 'champion a cause').",
    test: "Replace the word with your prediction; if the common meaning makes no sense, consider the word's other meanings.",
    trap: "Rejecting the right answer because its everyday meaning does not fit.",
    example: {
      wrong: "'The committee tabled the proposal' read as 'put it on a table'.",
      right: "'The committee tabled the proposal' meaning 'postponed it'.",
    },
  },

  // Text Structure and Purpose
  {
    id: "TSP-01",
    domain: CAS,
    skill: "Text Structure and Purpose",
    name: "Match the verb to the text",
    statement:
      "A purpose question asks why the author wrote it (verb first: to argue, describe, explain, question, illustrate), and a structure question asks how it is built (claim then examples, question then answer, general to specific); match the verb in each choice to what the text actually does.",
    spot_it: "'main purpose of the text' or 'overall structure of the text'.",
    test: "Say in your own words what the text does in its first half and second half, then find the choice whose verbs match both.",
    trap: "A choice whose verb overstates the text ('argue' or 'criticize' when the text only describes).",
    example: {
      wrong: "A text that describes how bats echolocate: 'to argue that bats are superior hunters'.",
      right: "A text that describes how bats echolocate: 'to explain how bats locate prey'.",
    },
  },
  {
    id: "TSP-02",
    domain: CAS,
    skill: "Text Structure and Purpose",
    name: "Function, not content",
    statement:
      "When asked about an underlined sentence, say what the sentence does for the sentences around it (sets up, supports, contrasts, qualifies), not what it says.",
    spot_it: "'Which choice best describes the function of the underlined sentence in the text as a whole?'",
    test: "Read the sentence before and after; label the underlined one with a job word (example, concession, transition, evidence).",
    trap: "A choice that restates the sentence's content instead of its role.",
    example: {
      wrong: "'It presents a statistic about rainfall.'",
      right: "'It provides evidence for the claim made in the previous sentence.'",
    },
  },

  // Cross-Text Connections
  {
    id: "CTC-01",
    domain: CAS,
    skill: "Cross-Text Connections",
    name: "True of both authors",
    statement: "Write each author's claim in five words; the right choice must be true of both authors' positions, not just one.",
    spot_it: "Two short texts labeled Text 1 and Text 2 and a question about how one author would respond to the other.",
    test: "Check the choice against Text 1's claim and Text 2's claim separately; it must fit both.",
    trap: "A choice that correctly summarizes one text and misstates the other.",
    example: {
      wrong: "Text 1 doubts the fossil dating; Text 2 confirms it. Pick: 'Both authors agree the dating is reliable.'",
      right: "Text 1 doubts the fossil dating; Text 2 confirms it. Pick: 'Text 2's author would say the new evidence resolves Text 1's doubt.'",
    },
  },

  // Central Ideas and Details
  {
    id: "CID-01",
    domain: INI,
    skill: "Central Ideas and Details",
    name: "Main idea covers the whole text",
    statement: "The main idea is supported by the whole text; a detail mentioned once is not the main idea.",
    spot_it: "'Which choice best states the main idea of the text?'",
    test: "Check that every sentence of the text supports the choice; if only one sentence does, it is a detail.",
    trap: "A choice drawn from a vivid detail or from the last sentence only.",
    example: {
      wrong: "A text about how glass frogs hide: 'Glass frogs sleep upside down.'",
      right: "A text about how glass frogs hide: 'Glass frogs use transparency to avoid predators.'",
    },
  },
  {
    id: "CID-02",
    domain: INI,
    skill: "Central Ideas and Details",
    name: "Point to the exact words",
    statement:
      "For a detail question, find the line, paraphrase it, and eliminate choices with words the text never supports (always, never, only, most).",
    spot_it: "'According to the text' or 'the text indicates that'.",
    test: "Point to the exact words in the text that support the choice; if you cannot, it is wrong.",
    trap: "A choice that reuses the text's words but changes the claim slightly.",
    example: {
      wrong: "Text: 'some bees forage at dusk'. Pick: 'Bees mostly forage at dusk.'",
      right: "Text: 'some bees forage at dusk'. Pick: 'Certain bees are active at dusk.'",
    },
  },

  // Command of Evidence
  {
    id: "COE-01",
    domain: INI,
    skill: "Command of Evidence",
    name: "Evidence hits the exact claim",
    statement:
      "Identify the exact claim in the question; the right quotation or finding bears directly on that claim in the direction asked (support or weaken), not merely on the topic.",
    spot_it: "'Which quotation most effectively illustrates the claim?' or 'Which finding would most directly support (or weaken) the hypothesis?'",
    test: "Write the claim in your own words, then check whether each choice proves or disproves that specific claim.",
    trap: "A choice on the same topic that does not address the claim's key word.",
    example: {
      wrong: "Claim: the poet uses nature to show grief. Pick: a line describing a sunny meadow.",
      right: "Claim: the poet uses nature to show grief. Pick: a line where wilting flowers mirror a loss.",
    },
  },
  {
    id: "COE-02",
    domain: INI,
    skill: "Command of Evidence",
    name: "True and relevant data",
    statement:
      "Read the axis labels and units first; the right choice must be both true according to the table or graph and the piece that completes the sentence's logic.",
    spot_it: "A table or graph with a sentence that ends in a blank.",
    test: "Check each choice against the data (true or false), then against the sentence (does it finish the point being made).",
    trap: "'True but irrelevant' choices and 'relevant but false' choices.",
    example: {
      wrong: "Pick a row that is accurate but about a different year than the sentence discusses.",
      right: "Pick the row that is accurate and matches the year and comparison the sentence sets up.",
    },
  },

  // Inferences
  {
    id: "INF-01",
    domain: INI,
    skill: "Inferences",
    name: "Conclusion forced by the premises",
    statement:
      "'Most logically completes the text' asks for the conclusion that follows from combining the stated premises; eliminate choices that add new information or overreach.",
    spot_it: "A text that ends mid-sentence with 'suggests that ___', 'this implies ___', or 'therefore ___'.",
    test: "List the text's premises; the right choice should be forced by them, not just consistent with them.",
    trap: "A choice that is plausible in the real world but not supported by the text's premises.",
    example: {
      wrong: "Premises: species X eats only lichen; lichen declines in polluted air. Pick: 'species X will go extinct.'",
      right: "Premises: species X eats only lichen; lichen declines in polluted air. Pick: 'species X may struggle where air pollution is high.'",
    },
  },

  // General
  {
    id: "GEN-01",
    domain: "General",
    skill: "General",
    name: "Extreme words are suspects",
    statement: "Extreme words (always, never, prove, impossible, only, all) are usually wrong on reading questions.",
    spot_it: "A choice that sounds stronger than anything the text says.",
    test: "Underline the extreme word and check whether the text supports that strength; it almost never does.",
    trap: "Confident-sounding choices feel right because they are decisive.",
    example: {
      wrong: "'The findings prove that all volcanoes behave this way.'",
      right: "'The findings suggest that some volcanoes behave this way.'",
    },
  },
  {
    id: "GEN-02",
    domain: "General",
    skill: "General",
    name: "Half right is all wrong",
    statement: "A choice with one wrong clause is wrong, even if the rest of it is perfect.",
    spot_it: "Long choices with two parts joined by 'and', 'because', or 'while'.",
    test: "Check every clause of a choice separately; one unsupported clause kills the whole choice.",
    trap: "Accepting a choice because its first half matches the text exactly.",
    example: {
      wrong: "'The author praises the method and predicts it will replace older ones' when the text only praises it.",
      right: "'The author praises the method' when the text only praises it.",
    },
  },
  {
    id: "GEN-03",
    domain: "General",
    skill: "General",
    name: "Answer the question asked",
    statement: "Answer the question that was asked, not a nearby question you expected.",
    spot_it: "The question has a specific target: the function of one sentence, the view of one author, the effect of one word.",
    test: "Reread the question stem after reading the choices and confirm the choice answers that exact wording.",
    trap: "A choice that is true about the text but answers a different question.",
    example: {
      wrong: "Question: what is the function of the last sentence? Pick: a summary of the whole text's main idea.",
      right: "Question: what is the function of the last sentence? Pick: 'It qualifies the claim made earlier.'",
    },
  },
];

export const RULES: Rule[] = [...RW_RULES.map((r) => ({ ...r, section: "rw" as const })), ...MATH_RULES];

export const RULE_BY_ID: ReadonlyMap<string, Rule> = new Map(RULES.map((r) => [r.id, r]));

export function getRule(id: string | null | undefined): Rule | null {
  if (!id) return null;
  return RULE_BY_ID.get(id.trim().toUpperCase()) ?? null;
}

export function rulesForSkill(skill: Skill | null): Rule[] {
  if (!skill) return RULES;
  return RULES.filter((r) => r.skill === skill);
}

export function rulesForSection(section: Section): Rule[] {
  return RULES.filter((r) => r.section === section);
}

/** Section-wide strategy rules (GEN-xx for Reading and Writing, MGEN-xx for Math). */
export function generalRules(section: Section): Rule[] {
  return RULES.filter((r) => r.domain === "General" && r.section === section);
}

export const GENERAL_RULES: Rule[] = generalRules("rw");

export function formatRulesForPrompt(rules: Rule[]): string {
  return rules
    .map(
      (r) =>
        `${r.id} ${r.name}\n  Rule: ${r.statement}\n  Spot it: ${r.spot_it}\n  Test: ${r.test}\n  Trap: ${r.trap}${r.shortcut ? `\n  Shortcut: ${r.shortcut}` : ""}`,
    )
    .join("\n");
}

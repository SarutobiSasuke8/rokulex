# Rokulex

An original crossword-tile word game. Two players, or you against a rival, lay letters on a 15×15 board, cross words through a center hearth, and race the score.

This is **not** Scrabble. The name, board, tile bag, letter values, and bonuses are original. Scrabble is a trademark of Hasbro in the US and Canada and Mattel elsewhere.

## Play

```bash
npm install
npm run dev
```

Open the local site, choose **Play the rival** or **Pass and play**.

- Tap a tile, then a square. Drag works too.
- The first word has to cover the brass hearth.
- Space flips across/down. Enter plays. Backspace lifts the last tile.
- Using all seven tiles scores a 35-point crest.
- Four passes in a row ends the game.

## Lexicon

`public/lexicon.txt` is a filtered common-English list (about 46,000 words, length 2–15) built from the [FrequencyWords](https://github.com/hermitdave/FrequencyWords) English 50k list, with two-letter junk removed. It is not a commercial tournament word list.

## Name

Working title was a “Rokumon” crossword, in the six-gates sense. **Scrabble** is closed as a trademark, and Rokumon is already a published board game, so the shipped name is **Rokulex**.

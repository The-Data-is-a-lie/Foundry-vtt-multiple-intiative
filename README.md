# multiple-intiatives

A FoundryVTT module that automatically creates multiple combatant entries on the initiative tracker when a specific minimum initiative bonus threshold is met.

## Features

- Automatically detects grants a creature extra turns depending on how high it's base initiative value is. Also, it allots buffs/debuffs if a natural 20 or a natural 1 are rolled. 

## Installation

1. Download from [FoundryVTT multiple initiatives](https://github.com/The-Data-is-a-lie/multiple-initiatives/archive/main.zip)

## Example

With default settings:
- When a creature has a base initiative score is higher (without rolling) they will receive extra turns. For example a creature has a base intiative bonus of 50, it will create entries with:
  - 50 + roll (original)
  - 30 (50 - 20)
  - 10 (50 - 40)

- When a creature rolls a Natural 20, 2 things happen:
 1) (on the first round only) He is given a 2nd turn, and it is boosted by +100
 2) His original roll (and the boosted roll) gain a +10

- When a character with a +0 initiative rolls a 20:
  (1st turn):
 - 130 (boosted)
 - 30 (original)

- When a creature rolls a Natural 1, 1 thing happens:
1) they receive a -10 to their total initiative roll

- When a character with a +0 initiative rolls a 1:
 - (-9) (debuffed)

## How It Works

The module utilizes the updateCombatant, updateCombat, deleteCombat hooks in FoundryVTT's initiative system to manipulate initiative values in real time. When it detects that a combatant has rolled the target initiative value, it automatically creates additional combatant entries with the partitioned initiative values.
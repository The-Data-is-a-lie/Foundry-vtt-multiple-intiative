# multiple-intiatives

A FoundryVTT module that automatically creates multiple combatant entries on the initiative tracker when a specific minimum initiative value is rolled.

## Features

- Automatically detects when a creature rolls a specific initiative value then rolls their intiative multiple times on the combat tracker

## Installation

1. Download from FoundryVTT multiple intiatives

## Example

With default settings:
- When a creature rolls initiative 50, it will create entries with:
  - 50 (original)
  - 30 (50 - 20)
  - 10 (50 - 40)

## How It Works

The module hooks into FoundryVTT's combatant update and creation events. When it detects that a combatant has rolled the target initiative value, it automatically creates additional combatant entries with the partitioned initiative values.

## License

MIT License - feel free to modify and distribute as needed.

# Initiative Partitioner

A FoundryVTT module that automatically creates multiple combatant entries on the initiative tracker when a specific initiative value is rolled.

## Features

- Automatically detects when a creature rolls a specific initiative value (default: 50)
- Creates multiple combatant entries with partitioned initiative values
- Configurable number of partitions and offset amount
- Works with both new combatant creation and initiative updates

## Installation

1. Copy this folder to your FoundryVTT `Data/modules/` directory
2. Restart FoundryVTT or refresh your browser
3. Enable the module in your world's module settings

## Configuration

The module provides the following settings (found in Module Settings):

- **Enable Initiative Partitioning**: Toggle the module on/off
- **Target Initiative Value**: The initiative value that triggers partitioning (default: 50)
- **Number of Partitions**: How many combatant entries to create (default: 3)
- **Partition Offset**: The amount to subtract for each partition (default: 20)

## Example

With default settings:
- When a creature rolls initiative 50, it will create entries with:
  - 50 (original)
  - 30 (50 - 20)
  - 10 (50 - 40)

## How It Works

The module hooks into FoundryVTT's combatant update and creation events. When it detects that a combatant has rolled the target initiative value, it automatically creates additional combatant entries with the partitioned initiative values.

Unlike the base FoundryVTT "Duplicate Initiative" feature, this module automatically creates the partitions whenever initiative is rolled, so they persist through combat rounds.

## Compatibility

- FoundryVTT v10+
- Tested with v12

## License

MIT License - feel free to modify and distribute as needed.

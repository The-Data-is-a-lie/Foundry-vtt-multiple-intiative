/**
 * Initiative Partitioner Module
 * Automatically creates multiple combatant entries when a specific initiative value is rolled
 */

Hooks.once("init", () => {
  console.log("Initiative Partitioner | Initializing");

  // Register module settings
  game.settings.register("initiative-partitioner", "enabled", {
    name: "Enable Initiative Partitioning",
    hint: "Enable automatic initiative partitioning",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register("initiative-partitioner", "targetInitiative", {
    name: "Target Initiative Value",
    hint: "The minimum initiative value that triggers partitioning (e.g., 50 for 50+)",
    scope: "world",
    config: true,
    type: Number,
    default: 21,
    range: {
      min: 1,
      max: 10000,
      step: 1
    }
  });

  game.settings.register("initiative-partitioner", "partitionCount", {
    name: "Number of Partitions",
    hint: "How many combatant entries to create (e.g., 3 for 50, 30, 10)",
    scope: "world",
    config: true,
    type: Number,
    default: 99999,
    range: {
      min: 2,
      max: 99999,
      step: 1
    }
  });

  game.settings.register("initiative-partitioner", "partitionOffset", {
    name: "Partition Offset",
    hint: "The amount to subtract for each partition (e.g., 20 for 50, 30, 10)",
    scope: "world",
    config: true,
    type: Number,
    default: 20,
    range: {
      min: 1,
      max: 99999,
      step: 1
    }
  });
});

/**
 * Helper function to check if a combatant is a partition
 */
function isPartition(combatant) {
  return combatant?.flags?.["initiative-partitioner"]?.isPartition === true;
}

/**
 * Helper function to clean up existing partitions for a combatant
 */
async function cleanupPartitions(combat, originalCombatantId) {
  if (!combat) return;
  
  const combatants = combat.combatants;
  const partitionsToDelete = combatants.filter(c => 
    c.flags?.["initiative-partitioner"]?.originalId === originalCombatantId
  );
  
  if (partitionsToDelete.length > 0) {
    const idsToDelete = partitionsToDelete.map(c => c.id);
    await combat.deleteEmbeddedDocuments("Combatant", idsToDelete);
    console.log(`Initiative Partitioner | Cleaned up ${idsToDelete.length} existing partitions`);
  }
}

/**
 * Hook into combatant updates to detect initiative rolls
 */
Hooks.on("updateCombatant", async (combatant, updateData, options, userId) => {
  // Only process if enabled and if initiative was updated
  if (!game.settings.get("initiative-partitioner", "enabled")) {
    return;
  }

  // Skip if this is a partition (don't create partitions from partitions)
  if (isPartition(combatant)) {
    return;
  }

  // Check if initiative was updated
  if (updateData.initiative === undefined) {
    return;
  }

  // Skip if this update was triggered by our module
  if (options.fromPartition) {
    return;
  }

  const targetInitiative = game.settings.get("initiative-partitioner", "targetInitiative");
  const partitionCount = game.settings.get("initiative-partitioner", "partitionCount");
  const partitionOffset = game.settings.get("initiative-partitioner", "partitionOffset");

  // Check if the rolled initiative is greater than or equal to the target value
  if (updateData.initiative >= targetInitiative) {
    const rolledInitiative = updateData.initiative;
    console.log(`Initiative Partitioner | Detected initiative ${rolledInitiative} (>= ${targetInitiative}) for ${combatant.name}`);
    
    // Get the combat instance
    const combat = combatant.combat;
    if (!combat) {
      console.warn("Initiative Partitioner | No combat instance found");
      return;
    }

    // Clean up any existing partitions for this combatant (in case initiative was re-rolled)
    await cleanupPartitions(combat, combatant.id);

    // Wait a bit to ensure the original update completes
    await new Promise(resolve => setTimeout(resolve, 100));

    // Create additional combatant entries with partitioned initiative values
    const combatantData = combatant.toObject();
    
    for (let i = 1; i < partitionCount; i++) {
      const newInitiative = rolledInitiative - (i * partitionOffset);
      
      // Only create if the new initiative is positive
      if (newInitiative > 0) {
        try {
          // Create a new combatant entry
          await combat.createEmbeddedDocuments("Combatant", [{
            ...combatantData,
            initiative: newInitiative,
            _id: null, // Let Foundry generate a new ID
            flags: {
              ...(combatantData.flags || {}),
              "initiative-partitioner": {
                isPartition: true,
                originalId: combatant.id,
                partitionIndex: i
              }
            }
          }], { fromPartition: true });
          
          console.log(`Initiative Partitioner | Created partition ${i} with initiative ${newInitiative}`);
        } catch (error) {
          console.error(`Initiative Partitioner | Error creating partition ${i}:`, error);
        }
      }
    }
  }
});

/**
 * Hook into combat creation to handle initial initiative rolls
 */
Hooks.on("createCombatant", async (combatant, options, userId) => {
  if (!game.settings.get("initiative-partitioner", "enabled")) {
    return;
  }

  // Check if this is a user-initiated creation (not from our module)
  if (options.fromPartition) {
    return;
  }

  // Skip if this is already a partition
  if (isPartition(combatant)) {
    return;
  }

  const targetInitiative = game.settings.get("initiative-partitioner", "targetInitiative");
  const partitionCount = game.settings.get("initiative-partitioner", "partitionCount");
  const partitionOffset = game.settings.get("initiative-partitioner", "partitionOffset");

  // Check if the initiative is greater than or equal to the target value
  if (combatant.initiative >= targetInitiative) {
    const rolledInitiative = combatant.initiative;
    console.log(`Initiative Partitioner | Detected initiative ${rolledInitiative} (>= ${targetInitiative}) on creation for ${combatant.name}`);
    
    const combat = combatant.combat;
    if (!combat) {
      return;
    }

    // Wait a bit to ensure the original creation completes
    await new Promise(resolve => setTimeout(resolve, 100));

    // Create additional combatant entries
    const combatantData = combatant.toObject();
    
    for (let i = 1; i < partitionCount; i++) {
      const newInitiative = rolledInitiative - (i * partitionOffset);
      
      if (newInitiative > 0) {
        try {
          await combat.createEmbeddedDocuments("Combatant", [{
            ...combatantData,
            initiative: newInitiative,
            _id: null,
            flags: {
              ...(combatantData.flags || {}),
              "initiative-partitioner": {
                isPartition: true,
                originalId: combatant.id,
                partitionIndex: i
              }
            }
          }], { fromPartition: true });
          
          console.log(`Initiative Partitioner | Created partition ${i} with initiative ${newInitiative}`);
        } catch (error) {
          console.error(`Initiative Partitioner | Error creating partition ${i}:`, error);
        }
      }
    }
  }
});

/**
 * Clean up partitions when combat ends or is deleted
 */
Hooks.on("deleteCombat", async (combat, options, userId) => {
  // Partitions will be automatically deleted with the combat, so no cleanup needed
  console.log("Initiative Partitioner | Combat deleted, partitions cleaned up automatically");
});

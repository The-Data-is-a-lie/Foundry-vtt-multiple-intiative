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
  
  let combatants = combat.combatants;
  let partitionsToDelete = combatants.filter(c => 
    c.flags?.["initiative-partitioner"]?.originalId === originalCombatantId &&
    c.flags?.["initiative-partitioner"]?.natural20Duplicate !== true // Don't delete natural 20 duplicates here
  );
  
  if (partitionsToDelete.length > 0) {
    let idsToDelete = partitionsToDelete.map(c => c.id);
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

  // Skip if this is a partition or natural 20 duplicate (don't create from these)
  if (isPartition(combatant) || combatant.flags?.["initiative-partitioner"]?.natural20Duplicate === true) {
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

  let targetInitiative = game.settings.get("initiative-partitioner", "targetInitiative");
  let partitionCount = game.settings.get("initiative-partitioner", "partitionCount");
  let partitionOffset = game.settings.get("initiative-partitioner", "partitionOffset");

  // Calculating d20 roll
  await new Promise(r => setTimeout(r, 50));
  let totalRoll = updateData.initiative; // e.g., 40
  let actor = combatant.actor;
  let initiativeMod = actor?.system?.attributes?.init?.total || 0;
  let d20Value = totalRoll - initiativeMod; // e.g., 15
  let bonuses = initiativeMod; // The bonuses are the initiative modifier

  console.log("totalRoll:", totalRoll, "d20Value:", d20Value, "bonuses:", bonuses);

  // Check if the rolled initiative is greater than or equal to the target value
  if (bonuses >= targetInitiative) {
    // Subtract from the intiative value to get the bonuses only
    let rolledInitiative = (updateData.initiative - d20Value);
    console.log(`Initiative Partitioner | Detected initiative ${rolledInitiative} (>= ${targetInitiative + d20Value}) for ${combatant.name}`);
    
    // Get the combat instance
    let combat = combatant.combat;
    if (!combat) {
      console.warn("Initiative Partitioner | No combat instance found");
      return;
    }

    // Clean up any existing partitions for this combatant (in case initiative was re-rolled)
    await cleanupPartitions(combat, combatant.id);

    // Wait a bit to ensure the original update completes
    await new Promise(resolve => setTimeout(resolve, 100));

    // Create additional combatant entries with partitioned initiative values
    let combatantData = combatant.toObject();
    
    // Remove fields that shouldn't be copied
    let { _id, sort, ...cleanData } = combatantData;
    
    for (let i = 1; i < partitionCount; i++) {
      let newInitiative = rolledInitiative - (i * partitionOffset);
      
      // Only create if the new initiative is positive
      if (newInitiative > 0) {
        try {
          // Create a new combatant entry
          await combat.createEmbeddedDocuments("Combatant", [{
            ...cleanData,
            initiative: newInitiative,
            flags: {
              ...(cleanData.flags || {}),
              "initiative-partitioner": {
                isPartition: true,
                originalId: combatant.id,
                partitionIndex: i
              }
            }
          }], { fromPartition: true });
          
          // Small delay between creations to avoid timing issues
          await new Promise(resolve => setTimeout(resolve, 50));
          
          console.log(`Initiative Partitioner | Created partition ${i} with initiative ${newInitiative}`);
        } catch (error) {
          console.error(`Initiative Partitioner | Error creating partition ${i}:`, error);
        }
      }
    }
  }

  // Special case: Natural 20 on Turn 1 - create duplicate token with highest initiative
  // Check if the d20 roll itself was 20, not just the total
  if (20 <= d20Value && d20Value <= 20.999999) {
      let combat = combatant.combat;
      if (!combat) {
        return;
      }
    // Check if it's turn 1 (round 1) of combat
    // If combat hasn't started or is on round 1, create duplicate
    let isTurn1 = !combat.started || combat.round === 1;
    
    if (isTurn1) {
      // Wait for partitions to be created first (if any)
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Get the updated combatant to find the highest initiative value
      let updatedCombatant = combat.combatants.get(combatant.id);
      if (!updatedCombatant) return;
      
      // Find all combatants with same original (including partitions)
      let allRelatedCombatants = combat.combatants.filter(c => 
        c.id === updatedCombatant.id || 
        c.flags?.["initiative-partitioner"]?.originalId === updatedCombatant.id
      );
      
      // Find the highest initiative value
      let highestInitiative = Math.max(...allRelatedCombatants.map(c => c.initiative || 0));
      
      // Check if we already created a natural 20 duplicate
      let hasNatural20Duplicate = allRelatedCombatants.some(c => 
        c.flags?.["initiative-partitioner"]?.natural20Duplicate === true
      );
      
      if (!hasNatural20Duplicate && highestInitiative > 0) {
        console.log(`Initiative Partitioner | Natural 20 on Turn 1! Creating duplicate with initiative ${highestInitiative}`);
        
        try {
          let combatantData = updatedCombatant.toObject();
          // Remove fields that shouldn't be copied
          let { _id, sort, ...cleanData } = combatantData;
          
          await combat.createEmbeddedDocuments("Combatant", [{
            ...cleanData,
            initiative: highestInitiative,
            flags: {
              ...(cleanData.flags || {}),
              "initiative-partitioner": {
                natural20Duplicate: true,
                originalId: updatedCombatant.id
              }
            }
          }], { fromPartition: true });
          
          console.log(`Initiative Partitioner | Created natural 20 duplicate with initiative ${highestInitiative}`);
        } catch (error) {
          console.error(`Initiative Partitioner | Error creating natural 20 duplicate:`, error);
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

  // Skip if this is already a partition or natural 20 duplicate
  if (isPartition(combatant) || combatant.flags?.["initiative-partitioner"]?.natural20Duplicate === true) {
    return;
  }

  let targetInitiative = game.settings.get("initiative-partitioner", "targetInitiative");
  let partitionCount = game.settings.get("initiative-partitioner", "partitionCount");
  let partitionOffset = game.settings.get("initiative-partitioner", "partitionOffset");

  // Check if the initiative is greater than or equal to the target value
  if (combatant.initiative >= targetInitiative) {
    let rolledInitiative = combatant.initiative;
    console.log(`Initiative Partitioner | Detected initiative ${rolledInitiative} (>= ${targetInitiative}) on creation for ${combatant.name}`);
    
    let combat = combatant.combat;
    if (!combat) {
      return;
    }

    // Wait a bit to ensure the original creation completes
    await new Promise(resolve => setTimeout(resolve, 100));

    // Create additional combatant entries
    let combatantData = combatant.toObject();
    
    // Remove fields that shouldn't be copied
    let { _id, sort, ...cleanData } = combatantData;
    
    for (let i = 1; i < partitionCount; i++) {
      let newInitiative = rolledInitiative - (i * partitionOffset);
      
      if (newInitiative > 0) {
        try {
          await combat.createEmbeddedDocuments("Combatant", [{
            ...cleanData,
            initiative: newInitiative,
            flags: {
              ...(cleanData.flags || {}),
              "initiative-partitioner": {
                isPartition: true,
                originalId: combatant.id,
                partitionIndex: i
              }
            }
          }], { fromPartition: true });
          
          // Small delay between creations to avoid timing issues
          await new Promise(resolve => setTimeout(resolve, 50));
          
          console.log(`Initiative Partitioner | Created partition ${i} with initiative ${newInitiative}`);
        } catch (error) {
          console.error(`Initiative Partitioner | Error creating partition ${i}:`, error);
        }
      }
    }
  }

  // Special case: Natural 20 on Turn 1 - create duplicate token with highest initiative
  // Check if the d20 roll itself was 20, not just the total
  let actor = combatant.actor;
  let initiativeMod = actor?.system?.attributes?.init?.total || 0;
  let d20Value = combatant.initiative - initiativeMod;

  if (20 <= d20Value && d20Value <= 20.999999) {
    let combat = combatant.combat;
    if (!combat) {
      return;
    }

    // Check if it's turn 1 (round 1) of combat
    let isTurn1 = !combat.started || combat.round === 1;
    
    if (isTurn1) {
      // Wait for partitions to be created first (if any)
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Get the combatant again to find the highest initiative value
      let updatedCombatant = combat.combatants.get(combatant.id);
      if (!updatedCombatant) return;
      
      // Find all combatants with same original (including partitions)
      let allRelatedCombatants = combat.combatants.filter(c => 
        c.id === updatedCombatant.id || 
        c.flags?.["initiative-partitioner"]?.originalId === updatedCombatant.id
      );
      
      // Find the highest initiative value
      let highestInitiative = Math.max(...allRelatedCombatants.map(c => c.initiative || 0));
      
      // Check if we already created a natural 20 duplicate
      let hasNatural20Duplicate = allRelatedCombatants.some(c => 
        c.flags?.["initiative-partitioner"]?.natural20Duplicate === true
      );
      
      if (!hasNatural20Duplicate && highestInitiative > 0) {
        console.log(`Initiative Partitioner | Natural 20 on Turn 1! Creating duplicate with initiative ${highestInitiative}`);
        
        try {
          let combatantData = updatedCombatant.toObject();
          // Remove fields that shouldn't be copied
          let { _id, sort, ...cleanData } = combatantData;
          
          await combat.createEmbeddedDocuments("Combatant", [{
            ...cleanData,
            initiative: highestInitiative,
            flags: {
              ...(cleanData.flags || {}),
              "initiative-partitioner": {
                natural20Duplicate: true,
                originalId: updatedCombatant.id
              }
            }
          }], { fromPartition: true });
          
          console.log(`Initiative Partitioner | Created natural 20 duplicate with initiative ${highestInitiative}`);
        } catch (error) {
          console.error(`Initiative Partitioner | Error creating natural 20 duplicate:`, error);
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

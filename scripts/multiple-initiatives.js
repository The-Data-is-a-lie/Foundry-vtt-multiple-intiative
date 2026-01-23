/**
 * multiple-intiatives Module
 * Automatically creates multiple combatant entries when a specific initiative value is rolled
 */


Hooks.once("init", () => {
  console.log("multiple-intiatives | Initializing");

  // Register module settings
  game.settings.register("multiple-initiatives", "enabled", {
    name: "Enable Multiple Turns",
    hint: "Enable automatic initiative partitioning",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register("multiple-initiatives", "targetInitiative", {
    name: "Target Initiative Value",
    hint: "The minimum initiative value that triggers partitioning (e.g., 50 for 50+)",
    scope: "world",
    config: true,
    type: Number,
    default: 21
  });

  game.settings.register("multiple-initiatives", "partitionCount", {
    name: "Max Number of Turns",
    hint: "How many combatant entries to create (e.g., 3 for 50, 30, 10)",
    scope: "world",
    config: true,
    type: Number,
    default: 99999
  });

  
  game.settings.register("multiple-initiatives", "Natural20Boost", {
    name: "Nat 20 Boost",
    hint: "The amount to add to your total roll whenever you roll a natural 20 on your initiative roll",
    scope: "world",
    config: true,
    type: Number,
    default: 10
  });

    game.settings.register("multiple-initiatives", "Natural1Debuff", {
    name: "Nat 1 Debuff",
    hint: "The amount to subtract from your total roll whenever you roll a natural 1 on your initiative roll",
    scope: "world",
    config: true,
    type: Number,
    default: 10
  });

  game.settings.register("multiple-initiatives", "partitionOffset", {
    name: "Initiative Offset",
    hint: "The amount to subtract for each extra turn(e.g., 20 for 50, 30, 10)",
    scope: "world",
    config: true,
    type: Number,
    default: 20
  });
});


/**
 * Helper function to check if a combatant is a partition
 */
function isPartition(combatant) {
  return combatant?.flags?.["multiple-initiatives"]?.isPartition === true;
}


/**
 * Helper function to clean up existing partitions for a combatant
 */
async function cleanupPartitions(combat, originalCombatantId) {
  if (!combat) return;
  
  let combatants = combat.combatants;
  let partitionsToDelete = combatants.filter(c => 
    c.flags?.["multiple-initiatives"]?.originalId === originalCombatantId &&
    c.flags?.["multiple-initiatives"]?.natural20Duplicate !== true // Don't delete natural 20 duplicates here
  );
  
  if (partitionsToDelete.length > 0) {
    let idsToDelete = partitionsToDelete.map(c => c.id);
    await combat.deleteEmbeddedDocuments("Combatant", idsToDelete);
    console.log(`multiple-intiatives | Cleaned up ${idsToDelete.length} existing partitions`);
  }
}

/**
 * Hook into combatant updates to detect initiative rolls
 */
Hooks.on("updateCombatant", async (combatant, updateData, options, userId) => {
  // Only process if enabled and if initiative was updated
  if (!game.settings.get("multiple-initiatives", "enabled")) {
    return;
  }

  // Skip if this is a partition or natural 20 duplicate (don't create from these)
  if (isPartition(combatant) || combatant.flags?.["multiple-initiatives"]?.natural20Duplicate === true) {
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

  let targetInitiative = game.settings.get("multiple-initiatives", "targetInitiative");
  let partitionCount = game.settings.get("multiple-initiatives", "partitionCount");
  let partitionOffset = game.settings.get("multiple-initiatives", "partitionOffset");
  let Natural20Boost = game.settings.get("multiple-initiatives", "Natural20Boost");
  let Natural1Debuff = game.settings.get("multiple-initiatives", "Natural1Debuff");

  // Calculating d20 roll
  await new Promise(r => setTimeout(r, 50));
  let totalRoll = updateData.initiative; // e.g., 40
  let actor = combatant.actor;
  let actorName = actor?.name || "Unknown";
  let initiativeMod = actor?.system?.attributes?.init?.total || 0;
  let bonuses = initiativeMod; // The bonuses are the initiative modifier
  let d20Value = totalRoll - initiativeMod - (bonuses / 100); // Removing tie breaker logic (1% of Initiative Modifier)
  let isNat20 = d20Value >= 20 && d20Value < 21;
  let isNat1 = d20Value < 2 && d20Value >= 1;


  // Adds a boost to the original roll if a natural 20 is detected
  if (isNat20) {
    console.log("multiple-initiatives | Natural 20 detected for", combatant.name);

    // Prevent double-boosting
    if (!combatant.flags?.["multiple-initiatives"]?.natural20Applied) {
      await combatant.update(
        {
          initiative: totalRoll + Natural20Boost,
          flags: {
            "multiple-initiatives": {
              ...(combatant.flags?.["multiple-initiatives"] || {}),
              natural20Applied: true
            }
          }
        },
        { fromPartition: true }
      );
    }
  }

  // Adds a debuff to the original roll if a natural 1 is detected
  if (isNat1) {
    console.log("multiple-initiatives | Natural 1 detected for", combatant.name);

    // Prevent double-debuffing
    if (!combatant.flags?.["multiple-initiatives"]?.natural1Applied) {
      await combatant.update(
        {
          initiative: totalRoll - Natural1Debuff,
          flags: {
            "multiple-initiatives": {
              ...(combatant.flags?.["multiple-initiatives"] || {}),
              natural1Applied: true
            }
          }
        },
        { fromPartition: true }
      );
    }
  }

  console.log("totalRoll:", totalRoll, "d20Value:", d20Value, "bonuses:", bonuses);

  // Check if the rolled initiative is greater than or equal to the target value
  if (bonuses >= targetInitiative) {
    // Use the initiative modifier as the base for partitioning
    let rolledInitiative = bonuses;
    console.log(`multiple-intiatives | Detected bonus ${rolledInitiative} (>= ${targetInitiative}) for ${combatant.name}`);
    
    // Get the combat instance
    let combat = combatant.combat;
    if (!combat) {
      console.warn("multiple-intiatives | No combat instance found");
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
            name: `${actorName} - #${i + 1}`,
            initiative: newInitiative,
            flags: {
              ...(cleanData.flags || {}),
              "multiple-initiatives": {
                isPartition: true,
                originalId: combatant.id,
                partitionIndex: i
              }
            }
          }], { fromPartition: true });
          
          // Small delay between creations to avoid timing issues
          await new Promise(resolve => setTimeout(resolve, 50));
          
          console.log(`multiple-intiatives | Created partition ${i} with initiative ${newInitiative}`);
        } catch (error) {
          console.error(`multiple-intiatives | Error creating partition ${i}:`, error);
        }
      }
    }
  }

  // Special case: Natural 20 on Turn 1 - create duplicate token with highest initiative
  // Check if the d20 roll itself was 20, not just the total

  // Tie Breaker logic = +1% Base to roll value -> we need to account for tie breaker logic
  if (isNat20) {
      let combat = combatant.combat;
      if (!combat) {
        return;
      }
    // Check if it's turn 1 (round 1) of combat
    // If combat hasn't started or is on round 1, create duplicate
    let isTurn1 = !combat.started || combat.round === 1;

    console.log("isTurn1:", isTurn1);
    
    if (!isTurn1) {
      return;
    }

    // Wait for partitions to be created first (if any)
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Get the updated combatant to find the highest initiative value
    let updatedCombatant = combat.combatants.get(combatant.id);
    if (!updatedCombatant) {
      return;
    }

    // Find all combatants with same original (including partitions)
    let allRelatedCombatants = combat.combatants.filter(c => 
      c.id === updatedCombatant.id || 
      c.flags?.["multiple-initiatives"]?.originalId === updatedCombatant.id
    );
    
    // Find the highest initiative value
    let highestInitiative = 100 + Math.max(...allRelatedCombatants.map(c => c.initiative || 0));
    
    // Check if we already created a natural 20 duplicate
    let hasNatural20Duplicate = allRelatedCombatants.some(c => 
      c.flags?.["multiple-initiatives"]?.natural20Duplicate === true
    );
    
    if (!hasNatural20Duplicate && highestInitiative > 0) {
      console.log(`multiple-intiatives | Natural 20 on Turn 1! Creating duplicate with initiative ${highestInitiative}`);
      
      try {
        let combatantData = updatedCombatant.toObject();
        // Remove fields that shouldn't be copied
        let { _id, sort, ...cleanData } = combatantData;
        
        await combat.createEmbeddedDocuments("Combatant", [{
          ...cleanData,
          name: `${actorName} - Nat 20`,
          initiative: highestInitiative,
          flags: {
            ...(cleanData.flags || {}),
            "multiple-initiatives": {
              natural20Duplicate: true,
              originalId: updatedCombatant.id
            }
          }
        }], { fromPartition: true });
        
        console.log(`multiple-intiatives | Created natural 20 duplicate with initiative ${highestInitiative}`);
      } catch (error) {
        console.error(`multiple-intiatives | Error creating natural 20 duplicate:`, error);
      }
    }
  }
});

/**
 * Hook into combat creation to handle initial initiative rolls
 */
Hooks.on("createCombatant", async (combatant, options, userId) => {
  if (!game.settings.get("multiple-initiatives", "enabled")) {
    return;
  }

  // console.log("Edge Case 1 | createCombatant hook called, but partitioning is handled in updateCombatant");

  // Check if this is a user-initiated creation (not from our module)
  if (options.fromPartition) {
    return;
  }

  // console.log("Edge Case 2 | createCombatant hook called, but partitioning is handled in updateCombatant");

  // Skip if this is already a partition or natural 20 duplicate
  if (isPartition(combatant) || combatant.flags?.["multiple-initiatives"]?.natural20Duplicate === true) {
    return;
  }

  // console.log("Edge Case 3 | createCombatant hook called, but partitioning is handled in updateCombatant");

  // Only process if initiative is already set (not undefined/null)
  // This prevents the hook from firing during combatant creation before initiative is rolled
  if (combatant.initiative == null) {
    return;
  }

  console.log("Edge Case 4 | createCombatant hook called, but partitioning is handled in updateCombatant");

});
/**
 * Clean up partitions when combat ends or is deleted
 */
Hooks.on("deleteCombat", async (combat, options, userId) => {
  // Partitions will be automatically deleted with the combat, so no cleanup needed
  console.log("multiple-intiatives | Combat deleted, partitions cleaned up automatically");
});

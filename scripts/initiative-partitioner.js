/**
 * Initiative Partitioner Module
 * Automatically creates multiple combatant entries when a specific initiative value is rolled
 */

// Store roll data for initiative rolls by combatant ID
const initiativeRollData = new Map();

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
 * Helper function to check if a d20 roll was a natural 20
 */
function isNatural20(combatant, updateData, options) {
  const combatantId = combatant.id || combatant._id;
  const actorId = combatant.actorId || combatant.actor?.id;
  
  console.log(`Initiative Partitioner | Checking for natural 20 - combatantId: ${combatantId}, actorId: ${actorId}`);
  
  // 1. Check our stored roll data from diceRoll hook
  const storedRoll = initiativeRollData.get(combatantId) || initiativeRollData.get(actorId);
  if (storedRoll) {
    console.log(`Initiative Partitioner | Found stored roll data:`, storedRoll);
    const d20Term = storedRoll.terms?.find(t => t?.faces === 20);
    if (d20Term && d20Term.results && Array.isArray(d20Term.results)) {
      const natural20Found = d20Term.results.some(r => {
        const result = r?.result ?? r?.value ?? r?.total;
        const isActive = r?.active !== false;
        console.log(`Initiative Partitioner | Stored roll d20 check: result=${result}, active=${isActive}`);
        return result === 20 && isActive;
      });
      if (natural20Found) {
        console.log(`Initiative Partitioner | ✓ Detected natural 20 from stored roll: d20 rolled 20`);
        return true;
      }
    }
  }
  
  // 2. Check the options.roll object
  const roll = options?.roll;
  if (roll && roll.terms) {
    const d20Term = roll.terms.find(t => t?.faces === 20);
    if (d20Term && d20Term.results && Array.isArray(d20Term.results)) {
      const natural20Found = d20Term.results.some(r => {
        const result = r?.result ?? r?.value ?? r?.total;
        const isActive = r?.active !== false;
        return result === 20 && isActive;
      });
      if (natural20Found) {
        console.log(`Initiative Partitioner | ✓ Detected natural 20 from options.roll: d20 rolled 20`);
        return true;
      }
    }
  }

  // 3. Check the combatant's internal roll flag
  if (game.combat) {
    try {
      const combatId = combatant.combat?.id || game.combat.id;
      const combatDoc = game.combats.get(combatId);
      const combatantDoc = combatDoc?.combatants.get(combatantId);
      
      if (combatantDoc?.getFlag) {
        const flagRoll = combatantDoc.getFlag("core", "initiativeRoll");
        if (flagRoll) {
          const rData = typeof flagRoll === "string" ? JSON.parse(flagRoll) : flagRoll;
          if (rData && rData.terms) {
            const d20 = rData.terms.find(t => t?.faces === 20);
            if (d20 && d20.results && Array.isArray(d20.results)) {
              const natural20Found = d20.results.some(r => {
                const result = r?.result ?? r?.value ?? r?.total;
                const isActive = r?.active !== false;
                return result === 20 && isActive;
              });
              if (natural20Found) {
                console.log(`Initiative Partitioner | ✓ Detected natural 20 from combatant flag: d20 rolled 20`);
                return true;
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("Initiative Partitioner | Error checking combatant flag for natural 20:", e);
    }
  }

  console.log(`Initiative Partitioner | No natural 20 detected - roll data not found or d20 was not 20`);
  return false;
}

/**
 * Hook into chat messages to capture initiative roll data
 * Initiative rolls in FoundryVTT create chat messages with roll data
 */
Hooks.on("createChatMessage", (chatMessage) => {
  // Check if this is a roll message (initiative rolls create roll messages)
  if (chatMessage && chatMessage.isRoll && chatMessage.roll) {
    const roll = chatMessage.roll;
    const d20Term = roll.terms?.find(t => t?.faces === 20);
    
    // If this roll has a d20, it might be an initiative roll
    if (d20Term) {
      // Try to find which combatant this relates to
      // Check speaker actor and combat context
      const actorId = chatMessage.speaker?.actor;
      
      if (actorId && game.combat) {
        // Find combatant with this actor
        const combatants = game.combat.combatants.filter(c => c.actorId === actorId);
        
        for (const combatant of combatants) {
          // Store roll data with combatant ID
          initiativeRollData.set(combatant.id, roll);
          console.log(`Initiative Partitioner | Captured roll data for combatant ${combatant.id}:`, roll);
          
          // Clean up after 5 seconds
          setTimeout(() => {
            initiativeRollData.delete(combatant.id);
          }, 5000);
        }
      }
    }
  }
});

/**
 * Helper function to clean up existing partitions for a combatant
 */
async function cleanupPartitions(combat, originalCombatantId) {
  if (!combat) return;
  
  const combatants = combat.combatants;
  const partitionsToDelete = combatants.filter(c => 
    c.flags?.["initiative-partitioner"]?.originalId === originalCombatantId &&
    c.flags?.["initiative-partitioner"]?.natural20Duplicate !== true // Don't delete natural 20 duplicates here
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
    
    // Remove fields that shouldn't be copied
    const { _id, sort, ...cleanData } = combatantData;
    
    for (let i = 1; i < partitionCount; i++) {
      const newInitiative = rolledInitiative - (i * partitionOffset);
      
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
  // Check immediately, and also check after a delay in case roll data isn't saved yet
  const checkNatural20 = async () => {
    // First check immediately
    if (isNatural20(combatant, updateData, options)) {
      return true;
    }
    
    // If not found, wait a bit and check the combatant's saved flag
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Re-check with updated combatant
    const combat = combatant.combat || game.combat;
    if (combat) {
      const updatedCombatant = combat.combatants.get(combatant.id);
      if (updatedCombatant) {
        return isNatural20(updatedCombatant, updateData, {});
      }
    }
    
    return false;
  };
  
  if (await checkNatural20()) {
    const combat = combatant.combat;
    if (!combat) {
      return;
    }

    // Check if it's turn 1 (round 1) of combat
    // If combat hasn't started or is on round 1, create duplicate
    const isTurn1 = !combat.started || combat.round === 1;
    
    if (isTurn1) {
      // Wait for partitions to be created first (if any)
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Get the updated combatant to find the highest initiative value
      const updatedCombatant = combat.combatants.get(combatant.id);
      if (!updatedCombatant) return;
      
      // Find all combatants with same original (including partitions)
      const allRelatedCombatants = combat.combatants.filter(c => 
        c.id === updatedCombatant.id || 
        c.flags?.["initiative-partitioner"]?.originalId === updatedCombatant.id
      );
      
      // Find the highest initiative value
      const highestInitiative = Math.max(...allRelatedCombatants.map(c => c.initiative || 0));
      
      // Check if we already created a natural 20 duplicate
      const hasNatural20Duplicate = allRelatedCombatants.some(c => 
        c.flags?.["initiative-partitioner"]?.natural20Duplicate === true
      );
      
      if (!hasNatural20Duplicate && highestInitiative > 0) {
        console.log(`Initiative Partitioner | Natural 20 on Turn 1! Creating duplicate with initiative ${highestInitiative}`);
        
        try {
          const combatantData = updatedCombatant.toObject();
          // Remove fields that shouldn't be copied
          const { _id, sort, ...cleanData } = combatantData;
          
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
    
    // Remove fields that shouldn't be copied
    const { _id, sort, ...cleanData } = combatantData;
    
    for (let i = 1; i < partitionCount; i++) {
      const newInitiative = rolledInitiative - (i * partitionOffset);
      
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
  // Use the same isNatural20 function to check roll data
  if (isNatural20(combatant, { initiative: combatant.initiative }, options)) {
    const combat = combatant.combat;
    if (!combat) {
      return;
    }

    // Check if it's turn 1 (round 1) of combat
    const isTurn1 = !combat.started || combat.round === 1;
    
    if (isTurn1) {
      // Wait for partitions to be created first (if any)
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Get the combatant again to find the highest initiative value
      const updatedCombatant = combat.combatants.get(combatant.id);
      if (!updatedCombatant) return;
      
      // Find all combatants with same original (including partitions)
      const allRelatedCombatants = combat.combatants.filter(c => 
        c.id === updatedCombatant.id || 
        c.flags?.["initiative-partitioner"]?.originalId === updatedCombatant.id
      );
      
      // Find the highest initiative value
      const highestInitiative = Math.max(...allRelatedCombatants.map(c => c.initiative || 0));
      
      // Check if we already created a natural 20 duplicate
      const hasNatural20Duplicate = allRelatedCombatants.some(c => 
        c.flags?.["initiative-partitioner"]?.natural20Duplicate === true
      );
      
      if (!hasNatural20Duplicate && highestInitiative > 0) {
        console.log(`Initiative Partitioner | Natural 20 on Turn 1! Creating duplicate with initiative ${highestInitiative}`);
        
        try {
          const combatantData = updatedCombatant.toObject();
          // Remove fields that shouldn't be copied
          const { _id, sort, ...cleanData } = combatantData;
          
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

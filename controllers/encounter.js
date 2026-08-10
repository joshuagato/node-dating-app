const { validationResult, matchedData } = require('express-validator');
const { Sequelize, Op } = require('sequelize');

const { organizeErrors } = require('../utils/functions');

const Encounter = require('../models/Encounter');
const { ENCOUNTER_ACTION } = require('../utils/constants');


exports.likeUser = async (req, res) => {
    const result = validationResult(req);
    const errors = organizeErrors(result.array());
    if (!result.isEmpty()) return res.send({ errors });

    const { id: initiator_id } = req.user;
    const { recipient_id, action } = req.body;
    let match = false;

    const existingEncounter = await Encounter.findOne({
        where: {
            initiator_id: recipient_id, recipient_id: initiator_id,
            action: { [Op.in]: [ENCOUNTER_ACTION.LIKE, ENCOUNTER_ACTION.SUPER_LIKE] }
        }
    });

    if (existingEncounter) {
        match = true;
        // TODO: Match
    }

    req.body.initiator_id = initiator_id;
    await Encounter.create(req.body);

    let success = true;
    res.send({ success, match });
}


exports.dislikeUser = async (req, res) => {
    const result = validationResult(req);
    const errors = organizeErrors(result.array());
    if (!result.isEmpty()) return res.send({ errors });

    const { id: initiator_id } = req.user;
    const { recipient_id, action } = req.body;
    let match = false;

    req.body.initiator_id = initiator_id;
    await Encounter.create(req.body);

    let success = true;
    res.send({ success });
}
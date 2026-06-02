'use strict';

/**
 * Serialise a requirement for an ANNOTATOR. Strips pragyanIncomp entirely so it
 * is never sent over the wire to a non-admin. This is the authoritative guard;
 * the UI never relies on hiding the field client-side.
 */
function serializeRequirementForAnnotator(req) {
  if (!req) return null;
  const obj = req.toObject ? req.toObject() : req;
  const { pragyanIncomp, __v, ...safe } = obj;
  return safe;
}

/**
 * Serialise a requirement for an ADMIN. pragyanIncomp is allowed.
 */
function serializeRequirementForAdmin(req) {
  if (!req) return null;
  const obj = req.toObject ? req.toObject() : req;
  const { __v, ...rest } = obj;
  return rest;
}

/**
 * Pick the right serializer based on role.
 */
function serializeRequirement(req, role) {
  return role === 'admin'
    ? serializeRequirementForAdmin(req)
    : serializeRequirementForAnnotator(req);
}

module.exports = {
  serializeRequirementForAnnotator,
  serializeRequirementForAdmin,
  serializeRequirement,
};

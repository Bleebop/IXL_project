# IXL Project

In railway signalling, an interlocking is a set of signals, switches, controller(s) and sensors that allows trains to move without risks of collision or derailment.

The goal of this repository is to demonstrate the possibility of making a simple and generic interlocking controller using relatively recent technology (ie, not [invented 200 years ago](https://en.wikipedia.org/wiki/Relay)).

## test IXL

Test IXL is an example of handmade controller using IEC 61131-3 languages.
This one is quite close to programs implemented in a current big city subway, including their idiosyncrasies (e.g. the "direction locks").

## Principles

The goal is to be able to generate this kind of program automatically from :
- The track topology 
- The track circuits (or whatever is used as block)
- Points
- Signals
- Routes

Routes are, fundamentally, a token to reserve part of the track and guaranty that it's safe to use in some way. These tokens could exist at a lower scale (e.g. for each track circuit, or even smaller), but routes are already commonly used, and we usually want to restrict (nominal) traffic to predefined routes only, so a more permissive behavior is not useful.

## Functions

Here are the functions used in the controller program :

- The central part is a function managing the states of the routes (formed (a train can pass through it), or destroyed (trains can't pass through it)), that includes 3 sub-functions
	- Route formation is relatively straightforward: if the formation or a route is demanded and no incompatible route is already formed or demanded, then the first route shall be formed
	- Automatic destruction is a way to automatically destroy a route when a train has finished running through it. It is safety critical (destroying a route allow incompatible routes to be formed) and, contrary to other safety critical functions, relies on the *occupation* of the track, so it requires special care.
	- Manual destruction allows to destruct routes manually. Various methods, mainly approach areas and timers, are used to ensure that a route won't be destroyed just in front of a train.
- Track occupation: if using only one kind of detection, this is pretty much only an input. If the interlocking controller use more than one method (track circuits, axle counter, ponctual detector, data from the CBTC system...), this function may need to merge this data.
- Automatic point command: in nominal cases, a point included in a formed route is commanded to the position which is suitable for the route. However this command may be disabled if the point is moved manually.
- Manual point command: in degraded cases a point may be moved mechanically by an operator on the track. We need to disable automatic point command if that's the case, as well as close any signal that can reach this point to avoid injuring the operator.
- Signal aspects: a signal is opened only if:
	- a route starting from this signal is formed
	- and all the points included in this route are at the correct position for this route
	- and the track behind the signal is free from other trains (may depend on whether CBTC is used)
	- and other conditions are respected (e.g. no point behind the signal is manually commanded)

## Proof

Ideally, the correctness of the controller program should be provable formally.
For example, by translating this program into a language that can be processed by a model checker, by writing properties to verify and using the model checker to verify that the properties are verified.
As [HLL](https://hal.science/hal-01799749/file/RATP-STF-16-01805_Publication_HLL_v.2.7.pdf) is the formal language I'm more familiar with, this will be the one used in this project.

Additionally, since the computing cost of model checking depend exponentially of the size of the interlocking (number of track circuit, signals, points, etc.) the translation and proof should use smart way to portion the track to simplify the proof. Again, routes are central to this: I am relatively confident we can portion the interlocking into each of its routes and prove separately the properties on each route, which should be quite fast. If a neighbouring route respect the simple rule of not letting a train pass through when it is not formed, the only information that need to be exchanged is the state of routes (and the state of route formation demands to cover the case of two routes demanded simultaneously).


